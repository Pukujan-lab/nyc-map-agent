#!/usr/bin/env python3
"""Seat state machine for the multi-agent hotload pack (executes ROLES.md).

This module implements the coordination protocol ``ROLES.md`` specifies but
previously only described: read the claim, evaluate lease expiry, write
vacancy, enqueue a claimant (FIFO), appoint the front of the queue on
vacancy, reject boss-only actions from a zombie, and append as-of history on
every seat change. Each operation maps onto a numbered rule in ``ROLES.md``
("Vacancy, queue, and claim", "Zombie boss").

Two boundaries it holds deliberately:

* **The watchdog is not an arbiter.** It may write ``vacant`` (``expire``);
  it never appoints. Appointment is the agent operation ``take_seat``,
  performed by the claimant who reaches the front of the queue.
* **One authoritative store.** The local claim file named in the assignment
  (``boss_failover.check_in.claim_file_path``, default
  ``.coord/boss_claim.json``) is the authoritative seat record — the pack is
  offline by design, and no pack script does GitHub I/O. The store is
  abstracted behind ``ClaimStore`` so a GitHub-backed store can replace
  ``LocalFileClaimStore`` without touching this state machine.

Append-only history is structural, not conventional: past ``as_of_history``
entries are exposed as frozen ``MappingProxyType`` views, and the single write
choke point asserts that every transition's new history extends — never
rewrites — the recorded one.

Stdlib only; Windows-safe (no ``fcntl``; ASCII-safe console output).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from types import MappingProxyType
from typing import Protocol

CLAIM_QUEUE = "claim_queue"
WHO_IS_BOSS_NOW = "who_is_boss_now"
LAST_HEARTBEAT = "last_heartbeat"
VACATED_AT = "vacated_at"
AS_OF_HISTORY = "as_of_history"
STATUS = "status"

DEFAULT_LEASE_TTL_MINUTES = 30.0
LEASE_TTL_MIN = 15.0
LEASE_TTL_MAX = 120.0

# ---------------------------------------------------------------------------
# Errors


class SeatError(RuntimeError):
    """Base class for protocol refusals. No state is written when one is raised."""


class ClockRegressionError(SeatError):
    """``now`` predates recorded state; refusing to write a rewound timeline."""


class ZombieBossError(SeatError):
    """The actor does not hold the boss seat: boss-only action rejected.

    Covers ROLES.md's zombie rule (the caller believed they were boss but the
    claim names someone else or is vacant) and a plain non-holder.
    """


class NotFrontOfQueueError(SeatError):
    """The seat is vacant but the claimant is not the front of ``claim_queue``."""


class SeatNotVacantError(SeatError):
    """A live boss still holds the lease; the seat cannot be taken."""


class CorruptClaimFileError(SeatError):
    """The claim record exists but is unusable (not JSON, or not an object)."""


class ClaimConcurrentWriteError(SeatError):
    """Another writer changed the claim between read and write (lost update)."""


# ---------------------------------------------------------------------------
# Time helpers


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def parse_dt(value: object) -> datetime | None:
    """Parse an ISO-8601 stamp to an aware UTC datetime, or None."""
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def evaluate_lease(
    last_heartbeat: datetime | None, lease_ttl_minutes: float, now: datetime
) -> bool:
    """True while the sitting boss's lease is valid at ``now``.

    The plain past-TTL predicate (ROLES.md: the seat is held only under a
    valid lease). Clock monotonicity is guarded separately in ``_apply`` so
    callers may inject any ``now`` — this stays a pure predicate.
    """
    if last_heartbeat is None:
        return False
    return (now - last_heartbeat).total_seconds() / 60.0 <= lease_ttl_minutes


# ---------------------------------------------------------------------------
# Store abstraction


class ClaimStore(Protocol):
    """The minimal persistence the seat state machine needs.

    Records are exchanged as **raw bytes** so the compare-and-swap compares
    exactly what is stored, and ``lock()`` serialises read-modify-write cycles
    across processes. A GitHub-backed store can implement these three members
    without any transition logic above this line changing.
    """

    def read_raw(self) -> bytes | None:
        """The raw record bytes, or ``None`` when no record exists."""
        ...  # pragma: no cover

    def peek_raw(self) -> bytes | None:
        """Read the raw record without taking the lock (dry-run preview only)."""
        ...  # pragma: no cover

    def write_if_unchanged(self, old: bytes | None, new: bytes) -> None:
        """Replace the record with ``new`` iff it still equals ``old``.

        Raises ``ClaimConcurrentWriteError`` on a lost race.
        """
        ...  # pragma: no cover

    def lock(self):  # pragma: no cover - protocol member
        """Context manager serialising a read-modify-write cycle."""
        ...


class _null_lock:
    def __enter__(self):
        return None

    def __exit__(self, *exc):
        return None


class InMemoryClaimStore:
    """``ClaimStore`` over one bytes cell: same protocol, no filesystem.

    Lets the identical protocol suite drive the state machine without disk and
    shows the abstraction is honest — nothing above the store knows where the
    bytes live.
    """

    def __init__(self, initial: bytes | None = None):
        self._raw = initial

    def read_raw(self) -> bytes | None:
        return self._raw

    def peek_raw(self) -> bytes | None:
        return self._raw

    def write_if_unchanged(self, old: bytes | None, new: bytes) -> None:
        if self._raw != old:
            raise ClaimConcurrentWriteError("claim changed since read (lost update)")
        self._raw = new

    def lock(self):
        return _null_lock()


class LocalFileClaimStore:
    """``ClaimStore`` over one local JSON file (the authoritative seat record).

    Writes are atomic (temp file + ``os.replace``). Concurrent writers are
    serialised with an ``O_EXCL`` lock file — the Windows-safe equivalent of
    ``flock``, since the pack must run on Windows where ``fcntl`` is absent.
    A lock whose holder died is broken after ``STALE_LOCK_SECONDS``; a lock
    whose mtime is in the *future* (the clock regressed after it was created)
    is broken immediately, so a rewound clock cannot deadlock the seat.
    """

    STALE_LOCK_SECONDS = 30.0
    # mtime skew below which a future-dated lock is filesystem rounding, not a
    # regressed clock (Windows NTFS mtime granularity + test-machine skew).
    FUTURE_SLOP_SECONDS = 5.0

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.lock_path = self.path.with_name(self.path.name + ".lock")

    def lock(self):
        return _file_lock(self)

    def _take_lock(self) -> None:
        # The lock file sits next to the record; both need the parent dir.
        self.path.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + 10.0
        while True:
            try:
                fd = os.open(str(self.lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(fd)
                return
            except FileExistsError:
                try:
                    mtime = self.lock_path.stat().st_mtime
                except FileNotFoundError:
                    continue  # freed meanwhile; retry at once
                # A lock whose holder died is broken after STALE_LOCK_SECONDS.
                # age below -FUTURE_SLOP_SECONDS means the lock's mtime is far
                # in the future: the clock regressed after creation, so the
                # stale window would never elapse -- break it. A small negative
                # age is ignored: filesystem mtime rounding (notably on
                # Windows) can make a just-created lock look milliseconds
                # future-dated, and breaking a *fresh* lock would defeat the
                # mutex entirely.
                age = time.time() - mtime
                if age < -self.FUTURE_SLOP_SECONDS or age > self.STALE_LOCK_SECONDS:
                    self._break_lock()
                if time.monotonic() > deadline:
                    raise ClaimConcurrentWriteError(
                        f"could not acquire claim lock {self.lock_path} within 10s"
                    )
                time.sleep(0.02)
            except PermissionError:
                # Windows delete-pending: another thread/process just unlinked
                # the lock and the name is still settling. It is not held --
                # retry until the name clears or the deadline passes.
                if time.monotonic() > deadline:
                    raise ClaimConcurrentWriteError(
                        f"could not acquire claim lock {self.lock_path} within 10s"
                    )
                time.sleep(0.02)

    def _break_lock(self) -> None:
        """Remove a stale lock, tolerating Windows delete-pending semantics.

        On Windows another process's unlink of the same file can race ours and
        surface as ``PermissionError`` (delete-pending). A failed break is not
        fatal: the retry loop re-examines the lock and either finds it gone or
        re-attempts after the holder's window.
        """
        try:
            self.lock_path.unlink()
        except FileNotFoundError:
            pass
        except PermissionError:
            # delete-pending: the holder (or another breaker) is removing it.
            pass

    def _free_lock(self) -> None:
        """Free a lock we hold (plain unlink; a missing file is fine)."""
        try:
            self.lock_path.unlink()
        except FileNotFoundError:
            pass

    def read_raw(self) -> bytes | None:
        with self.lock():
            return self._read_raw_unlocked()

    def peek_raw(self) -> bytes | None:
        # No lock: dry-run must never block on (or be blocked by) a live
        # transition, and it writes nothing.
        return self._read_raw_unlocked()

    def _read_raw_unlocked(self) -> bytes | None:
        if not self.path.is_file():
            return None
        try:
            return self.path.read_bytes()
        except OSError as exc:
            raise CorruptClaimFileError(f"claim file {self.path} is unreadable: {exc}") from exc

    def write_if_unchanged(self, old: bytes | None, new: bytes) -> None:
        with self.lock():
            current = self._read_raw_unlocked()
            if current != old:
                raise ClaimConcurrentWriteError(
                    f"claim file {self.path} changed since it was read (lost update)"
                )
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(prefix=self.path.name + ".", dir=str(self.path.parent))
            try:
                with os.fdopen(fd, "wb") as fh:
                    fh.write(new)
                os.replace(tmp, self.path)
            except BaseException:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                raise


class _file_lock:
    def __init__(self, store: LocalFileClaimStore):
        self.store = store

    def __enter__(self):
        self.store._take_lock()
        return None

    def __exit__(self, *exc):
        self.store._free_lock()
        return None


# ---------------------------------------------------------------------------
# Claim record


def encode_claim(claim: dict) -> bytes:
    return (json.dumps(claim, indent=2) + "\n").encode("utf-8")


def normalise_claim(raw: bytes | None) -> dict:
    """Decode a raw claim into the protocol shape, preserving unknown keys.

    An absent record is a fresh vacant claim. A present-but-unusable record
    raises ``CorruptClaimFileError`` — never silently treated as vacant, since
    that would overwrite a record we failed to understand.
    """
    if raw is None:
        return {
            STATUS: "vacant",
            WHO_IS_BOSS_NOW: None,
            LAST_HEARTBEAT: None,
            VACATED_AT: None,
            CLAIM_QUEUE: [],
            AS_OF_HISTORY: [],
        }
    try:
        data = json.loads(raw.decode("utf-8-sig"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise CorruptClaimFileError(f"claim record is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise CorruptClaimFileError("claim record is not a JSON object")

    claim = dict(data)
    claim.setdefault(STATUS, "vacant")
    claim.setdefault(WHO_IS_BOSS_NOW, None)
    claim.setdefault(LAST_HEARTBEAT, None)
    claim.setdefault(VACATED_AT, None)
    claim.setdefault(CLAIM_QUEUE, [])
    claim.setdefault(AS_OF_HISTORY, [])

    if not isinstance(claim[CLAIM_QUEUE], list) or any(
        not isinstance(a, str) or not a.strip() for a in claim[CLAIM_QUEUE]
    ):
        raise CorruptClaimFileError("claim_queue must be a list of non-empty agent ids")
    if not isinstance(claim[AS_OF_HISTORY], list) or any(
        not isinstance(e, dict) for e in claim[AS_OF_HISTORY]
    ):
        raise CorruptClaimFileError("as_of_history must be a list of objects")
    for key in (LAST_HEARTBEAT, VACATED_AT):
        if claim[key] is not None and parse_dt(claim[key]) is None:
            raise CorruptClaimFileError(f"{key} is not a parseable ISO-8601 timestamp")
    boss = claim[WHO_IS_BOSS_NOW]
    if boss is not None and (not isinstance(boss, str) or not boss.strip()):
        raise CorruptClaimFileError("who_is_boss_now must be a non-empty agent id or null")
    return claim


def max_recorded_time(claim: dict) -> datetime | None:
    """The newest clock value the claim already records."""
    stamps = [parse_dt(claim.get(LAST_HEARTBEAT)), parse_dt(claim.get(VACATED_AT))]
    for entry in claim.get(AS_OF_HISTORY, []):
        stamps.append(parse_dt(entry.get("as_of")))
        stamps.append(parse_dt(entry.get("ended_at")))
    present = [s for s in stamps if s is not None]
    return max(present) if present else None


# ---------------------------------------------------------------------------
# Append-only history


class AppendOnlyHistory:
    """A view of ``as_of_history`` that can only extend, never rewrite.

    Recorded entries are held as frozen ``MappingProxyType`` mappings: no
    method on this class can modify or drop a past entry, and an attempt to
    mutate through the view raises ``TypeError``. ``append`` returns a **new
    list** of plain (JSON-serialisable) dicts, leaving the recorded entries
    untouched. Append-only is therefore a property of the type, not a
    convention callers must remember.
    """

    __slots__ = ("_frozen",)

    def __init__(self, claim: dict):
        self._frozen: tuple = tuple(
            MappingProxyType(dict(entry)) for entry in claim.get(AS_OF_HISTORY, [])
        )

    @property
    def recorded(self) -> tuple:
        """The recorded entries, frozen and read-only."""
        return self._frozen

    def append(self, entry: dict, now: datetime) -> list[dict]:
        """Return the recorded history plus one new entry."""
        if not entry.get("boss_agent_id"):
            raise SeatError("as-of history entry requires boss_agent_id")
        stamped = dict(entry)
        stamped.setdefault("as_of", iso(now))
        stamped.setdefault("ended_at", None)
        stamped.setdefault("notes", "")
        return [dict(e) for e in self._frozen] + [stamped]


# ---------------------------------------------------------------------------
# The seat state machine


class SeatMachine:
    """Executes the ROLES.md seat protocol against a ``ClaimStore``.

    Each operation is one atomic transition: read the raw record, normalise it,
    run the guard, apply a pure mutator, assert the history is still
    append-only, then write only if the record actually changed. A guard
    failure writes nothing.
    """

    def __init__(self, store: ClaimStore, *, lease_ttl_minutes: float = DEFAULT_LEASE_TTL_MINUTES):
        if not (LEASE_TTL_MIN <= lease_ttl_minutes <= LEASE_TTL_MAX):
            raise ValueError(
                f"lease_ttl_minutes must be {LEASE_TTL_MIN:g}..{LEASE_TTL_MAX:g} "
                "(ROLES.md: default 30; projects set 15-120)"
            )
        self.store = store
        self.lease_ttl_minutes = float(lease_ttl_minutes)

    # -- reads -------------------------------------------------------------

    def status(self) -> dict:
        """The current claim (normalised), read-only."""
        return normalise_claim(self.store.read_raw())

    def holder(self, now: datetime | None = None) -> str | None:
        """The agent actually holding the seat at ``now`` (lease-aware)."""
        now = now or utcnow()
        claim = self.status()
        if evaluate_lease(parse_dt(claim.get(LAST_HEARTBEAT)), self.lease_ttl_minutes, now):
            return claim.get(WHO_IS_BOSS_NOW)
        return None

    # -- transitions -------------------------------------------------------

    def join(self, agent_id: str, now: datetime | None = None) -> dict:
        """First continuer takes an empty room (ROLES.md role fill order).

        Valid only when no boss holds the seat and the queue is empty. In a
        room that already has a boss or a queue this is a no-op: the agent is
        a worker (coder1, coder2, ...), and joining must not disturb the seat.
        """
        now = now or utcnow()
        return self._apply(self._mut_join(agent_id), now)

    def renew(self, agent_id: str, now: datetime | None = None) -> dict:
        """Sitting boss renews its check-in (ROLES.md: renew while active).

        A boss whose lease already expired is a zombie and cannot renew: the
        seat must be vacated and re-won from the front of the queue. There is
        no automatic reclaim.
        """
        now = now or utcnow()
        return self._apply(self._mut_renew(agent_id), now)

    def enqueue(self, agent_id: str, now: datetime | None = None) -> dict:
        """Append a claimant to the back of ``claim_queue`` (FIFO).

        Duplicate delivery of the same check-in is idempotent: an agent already
        queued, or already the sitting boss, is not added twice. A queue
        position is only meaningful after vacancy, so a live boss refuses new
        claims (they would jump a seat that is not open).
        """
        now = now or utcnow()
        return self._apply(self._mut_enqueue(agent_id), now)

    def take_seat(self, agent_id: str, now: datetime | None = None) -> dict:
        """Front of the queue takes the vacant seat (ROLES.md step 3).

        The appointment operation — the one the watchdog is forbidden to
        perform. Guards: the seat must actually be vacant (a live boss keeps
        it) and the claimant must be the front of the queue. Expires a stale
        lease first, so a claimant may take a seat whose boss went silent.
        """
        now = now or utcnow()
        return self._apply(self._mut_take_seat(agent_id), now)

    def expire(self, now: datetime | None = None) -> dict:
        """Write the seat vacant when the sitting boss is past lease TTL.

        The watchdog path (ROLES.md: "may write vacant; it does not appoint").
        Idempotent: an already-vacant seat is a no-op, not a rewrite. The
        claim queue is preserved untouched.
        """
        now = now or utcnow()
        return self._apply(self._mut_expire(), now)

    def zombie_reject(self, agent_id: str, now: datetime | None = None) -> dict:
        """A woken old boss rejects boss actions and re-queues at the end.

        ROLES.md "Zombie boss": re-read the claim; if it names someone else
        (or is vacant) you may not ACCEPT/REJECT or renew. Drop to worker or
        re-queue at the end — no automatic reclaim, and the head of the queue
        is never reordered.
        """
        now = now or utcnow()
        return self._apply(self._mut_zombie_reject(agent_id), now)

    def boss_action(self, agent_id: str, now: datetime | None = None) -> dict:
        """Read-only guard for boss-only actions (ACCEPT/REJECT, appointing).

        Returns the claim iff ``agent_id`` holds the seat under a valid lease.
        Writes nothing, so it can never authorize a zombie: a caller whose
        lease expired, or whose seat was taken, is refused here.
        """
        now = now or utcnow()
        claim = self.status()
        if claim.get(WHO_IS_BOSS_NOW) != agent_id:
            raise ZombieBossError(
                f"agent {agent_id} does not hold the boss seat "
                f"(who_is_boss_now={claim.get(WHO_IS_BOSS_NOW)!r}); "
                "boss-only action rejected - re-read the claim and re-queue at the end"
            )
        if not evaluate_lease(
            parse_dt(claim.get(LAST_HEARTBEAT)), self.lease_ttl_minutes, now
        ):
            raise ZombieBossError(
                f"agent {agent_id} is past lease TTL; the seat is no longer held "
                "(no automatic reclaim) - re-queue at the end of claim_queue"
            )
        return claim

    def plan(self, op: str, agent_id: str | None = None, now: datetime | None = None) -> dict:
        """Compute a transition's result without writing (``--dry-run``).

        Takes no lock and writes nothing, and mirrors ``_apply``'s guard order
        exactly, so the preview reports the same outcome the real call would
        produce (including a refusal).
        """
        now = now or utcnow()
        claim = normalise_claim(self.store.peek_raw())
        new = self._mutator_for(op, agent_id)(claim, now)
        if new == claim:
            return claim
        self._guard_clock(claim, now)
        self._assert_append_only(claim, new)
        return new

    # -- mutators (pure: claim in, claim out) -------------------------------

    def _mutator_for(self, op: str, agent_id: str | None):
        table = {
            "join": self._mut_join,
            "renew": self._mut_renew,
            "enqueue": self._mut_enqueue,
            "take-seat": self._mut_take_seat,
            "expire": self._mut_expire,
            "zombie-reject": self._mut_zombie_reject,
        }
        if op not in table:
            raise SeatError(f"unknown operation {op!r}")
        if op == "expire":
            return table[op]()
        if not agent_id:
            raise SeatError(f"operation {op!r} requires an agent id")
        return table[op](agent_id)

    def _mut_join(self, agent_id: str):
        def mutator(claim: dict, now: datetime) -> dict:
            if claim[WHO_IS_BOSS_NOW] or claim[CLAIM_QUEUE]:
                return claim  # room is not empty: the agent is a worker, seat unchanged
            return self._appoint(claim, agent_id, "first continuer (empty room)", now)
        return mutator

    def _mut_renew(self, agent_id: str):
        def mutator(claim: dict, now: datetime) -> dict:
            self._require_holder(claim, agent_id, now)
            new = dict(claim)
            new[LAST_HEARTBEAT] = iso(now)
            new[VACATED_AT] = None
            new[STATUS] = "held"
            return new
        return mutator

    def _mut_enqueue(self, agent_id: str):
        def mutator(claim: dict, now: datetime) -> dict:
            if claim[WHO_IS_BOSS_NOW] == agent_id:
                return claim  # already the boss; nothing to enqueue
            if agent_id in claim[CLAIM_QUEUE]:
                return claim  # duplicate delivery: idempotent
            if claim[WHO_IS_BOSS_NOW] and evaluate_lease(
                parse_dt(claim.get(LAST_HEARTBEAT)), self.lease_ttl_minutes, now
            ):
                raise SeatNotVacantError(
                    f"seat held by {claim[WHO_IS_BOSS_NOW]} under a valid lease; "
                    "enqueue only after vacancy (ROLES.md step 3)"
                )
            new = dict(claim)
            new[CLAIM_QUEUE] = [*claim[CLAIM_QUEUE], agent_id]
            return new
        return mutator

    def _mut_take_seat(self, agent_id: str):
        def mutator(claim: dict, now: datetime) -> dict:
            if claim[WHO_IS_BOSS_NOW] == agent_id:
                return claim  # already boss (idempotent)
            claim = self._expire_if_stale(claim, now)
            if claim[WHO_IS_BOSS_NOW] is not None:
                raise SeatNotVacantError(
                    f"seat held by {claim[WHO_IS_BOSS_NOW]}; {agent_id} cannot take it"
                )
            queue = list(claim[CLAIM_QUEUE])
            if not queue:
                raise NotFrontOfQueueError(
                    "claim_queue is empty; join an empty room or enqueue first"
                )
            if queue[0] != agent_id:
                raise NotFrontOfQueueError(
                    f"front of claim_queue is {queue[0]!r}, not {agent_id!r} (FIFO)"
                )
            claim = dict(claim)
            claim[CLAIM_QUEUE] = queue[1:]
            return self._appoint(claim, agent_id, "front of claim_queue", now)
        return mutator

    def _mut_expire(self):
        def mutator(claim: dict, now: datetime) -> dict:
            return self._expire_if_stale(claim, now)
        return mutator

    def _mut_zombie_reject(self, agent_id: str):
        def mutator(claim: dict, now: datetime) -> dict:
            if claim[WHO_IS_BOSS_NOW] == agent_id:
                return claim  # still the boss: nothing to re-queue
            if agent_id in claim[CLAIM_QUEUE]:
                return claim  # idempotent
            new = dict(claim)
            new[CLAIM_QUEUE] = [*claim[CLAIM_QUEUE], agent_id]  # end of the queue
            return new
        return mutator

    # -- shared pieces ------------------------------------------------------

    def _require_holder(self, claim: dict, agent_id: str, now: datetime) -> None:
        if claim[WHO_IS_BOSS_NOW] != agent_id:
            raise ZombieBossError(
                f"agent {agent_id} does not hold the boss seat "
                f"(who_is_boss_now={claim[WHO_IS_BOSS_NOW]!r})"
            )
        if not evaluate_lease(
            parse_dt(claim.get(LAST_HEARTBEAT)), self.lease_ttl_minutes, now
        ):
            raise ZombieBossError(
                f"agent {agent_id} is past lease TTL; the seat is vacant "
                "(no automatic reclaim) - re-queue at the end"
            )

    def _expire_if_stale(self, claim: dict, now: datetime) -> dict:
        """Vacate a seat whose boss is past TTL, appending as-of history."""
        boss = claim[WHO_IS_BOSS_NOW]
        if not boss:
            return claim
        if evaluate_lease(parse_dt(claim.get(LAST_HEARTBEAT)), self.lease_ttl_minutes, now):
            return claim
        history = AppendOnlyHistory(claim).append(
            {
                "boss_agent_id": boss,
                "ended_at": iso(now),
                "notes": "lease expired; seat vacant",
            },
            now,
        )
        new = dict(claim)
        new[STATUS] = "vacant"
        new[WHO_IS_BOSS_NOW] = None
        new[VACATED_AT] = iso(now)
        new[AS_OF_HISTORY] = history
        return new

    def _appoint(self, claim: dict, agent_id: str, notes: str, now: datetime) -> dict:
        """Seat the agent and append as-of history (the only appointing path)."""
        history = AppendOnlyHistory(claim).append(
            {"boss_agent_id": agent_id, "ended_at": None, "notes": notes},
            now,
        )
        new = dict(claim)
        new[STATUS] = "held"
        new[WHO_IS_BOSS_NOW] = agent_id
        new[LAST_HEARTBEAT] = iso(now)
        new[VACATED_AT] = None
        new[AS_OF_HISTORY] = history
        return new

    # -- the write choke point ---------------------------------------------

    def _apply(self, mutator, now: datetime, *, retries: int = 5) -> dict:
        """Run one transition, writing only when it changes the record.

        The clock guard runs **before** the mutator, not after: a rewound
        clock must be refused even when the transition would otherwise look
        like a no-op (a negative lease age makes a stale lease seem fresh —
        exactly the state an old boss would want to smuggle through). The
        append-only assertion then runs on the single path every transition
        takes, so no operation can rewrite a past history entry. A lost
        compare-and-swap (another writer landed first) re-reads and re-runs
        the mutator against the fresh record.
        """
        for attempt in range(retries):
            raw = self.store.read_raw()
            claim = normalise_claim(raw)
            self._guard_clock(claim, now)
            new = mutator(claim, now)
            if new == claim:
                return claim  # no-op transition: write nothing
            self._assert_append_only(claim, new)
            try:
                self.store.write_if_unchanged(raw, encode_claim(new))
            except ClaimConcurrentWriteError:
                if attempt == retries - 1:
                    raise
                continue  # another writer landed; retry against fresh state
            return new
        raise ClaimConcurrentWriteError("transition did not converge")

    def _guard_clock(self, claim: dict, now: datetime) -> None:
        newest = max_recorded_time(claim)
        if newest is not None and now < newest:
            raise ClockRegressionError(
                f"now={iso(now)} predates the newest recorded time {iso(newest)}; "
                "refusing to write a rewound timeline (never rewrite recorded state)"
            )

    @staticmethod
    def _assert_append_only(old: dict, new: dict) -> None:
        """The structural append-only rule, enforced at the single write point.

        Two properties, both checked rather than assumed:

        1. the new history extends the recorded one — same entries, same order,
           nothing rewritten or dropped;
        2. a seat change (``who_is_boss_now`` or ``status``) *must* have
           appended an entry, so no code path can move the seat without
           recording who was boss at that time (ROLES.md step 6).
        """
        before = old.get(AS_OF_HISTORY, [])
        after = new.get(AS_OF_HISTORY, [])
        if len(after) < len(before) or after[: len(before)] != before:
            raise SeatError(
                "append-only violation: a transition rewrote or dropped a past "
                "as_of_history entry"
            )
        seat_changed = (old.get(WHO_IS_BOSS_NOW), old.get(STATUS)) != (
            new.get(WHO_IS_BOSS_NOW),
            new.get(STATUS),
        )
        if seat_changed and len(after) == len(before):
            raise SeatError(
                "seat changed without appending as-of history "
                "(ROLES.md: append on every seat change)"
            )


# ---------------------------------------------------------------------------
# CLI


def console_safe(text: str) -> str:
    """ASCII-safe for Windows cp1252 consoles (unicode punctuation crashes print)."""
    return (
        text.replace("→", "->")
        .replace("←", "<-")
        .replace("⇒", "=>")
        .replace("—", "--")
        .replace("–", "-")
        .replace("…", "...")
        .replace(" ", " ")
    )


def _claim_path_from_assignment(assignment: Path) -> Path:
    with assignment.open(encoding="utf-8-sig") as fh:
        data = json.load(fh)
    bf = data.get("boss_failover") or {}
    check_in = bf.get("check_in") or {}
    return Path(check_in.get("claim_file_path") or ".coord/boss_claim.json")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Seat state machine for the multi-agent hotload pack. Executes the "
            "ROLES.md protocol against the authoritative local claim file."
        )
    )
    parser.add_argument(
        "operation",
        choices=["status", "join", "renew", "enqueue", "take-seat", "expire",
                 "zombie-reject", "boss-action"],
    )
    parser.add_argument("--agent", default=None, help="agent_id performing the operation")
    parser.add_argument(
        "--claim-file",
        type=Path,
        default=None,
        help="claim record path (else assignment check_in.claim_file_path, "
        "else .coord/boss_claim.json)",
    )
    parser.add_argument(
        "--assignment",
        type=Path,
        default=None,
        help="assignment JSON to read check_in.claim_file_path from",
    )
    parser.add_argument(
        "--lease-ttl-minutes",
        type=float,
        default=DEFAULT_LEASE_TTL_MINUTES,
        help="boss lease TTL in minutes (ROLES.md default 30; range 15-120)",
    )
    parser.add_argument("--now", default=None, help="ISO-8601 override for the clock (tests)")
    parser.add_argument("--dry-run", action="store_true", help="compute the transition; write nothing")
    parser.add_argument("--json", action="store_true", help="print the resulting claim as JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.claim_file is not None:
        claim_path = args.claim_file
    elif args.assignment is not None:
        try:
            claim_path = _claim_path_from_assignment(args.assignment)
        except (OSError, json.JSONDecodeError) as exc:
            print(f"seat_protocol: FAIL\n  - assignment unreadable: {args.assignment}: {exc}")
            return 2
    else:
        claim_path = Path(".coord/boss_claim.json")
    if not claim_path.is_absolute():
        claim_path = Path.cwd() / claim_path

    store = LocalFileClaimStore(claim_path)
    machine = SeatMachine(store, lease_ttl_minutes=args.lease_ttl_minutes)
    now = parse_dt(args.now) if args.now else utcnow()
    if args.now and now is None:
        print(f"seat_protocol: FAIL\n  - --now is not a parseable ISO-8601 timestamp: {args.now}")
        return 2

    if args.operation == "status":
        try:
            claim = machine.status()
        except CorruptClaimFileError as exc:
            print(f"seat_protocol: FAIL\n  - {console_safe(str(exc))}")
            return 2
        return _report(claim, args, claim_path)

    if args.operation == "boss-action":
        if not args.agent:
            print("seat_protocol: FAIL\n  - boss-action requires --agent")
            return 2
        try:
            machine.boss_action(args.agent, now)
        except SeatError as exc:
            print(f"seat_protocol: REFUSED ({type(exc).__name__})\n  - {console_safe(str(exc))}")
            return 1
        print(f"seat_protocol: ALLOWED (agent {args.agent} holds the seat under a valid lease)")
        return 0

    if args.operation != "expire" and not args.agent:
        print(f"seat_protocol: FAIL\n  - {args.operation} requires --agent")
        return 2

    try:
        if args.dry_run:
            claim = machine.plan(args.operation, args.agent, now)
        else:
            claim = getattr(machine, args.operation.replace("-", "_"))(args.agent, now) \
                if args.operation != "expire" else machine.expire(now)
    except CorruptClaimFileError as exc:
        print(f"seat_protocol: FAIL (corrupt claim)\n  - {console_safe(str(exc))}")
        return 2
    except SeatError as exc:
        print(f"seat_protocol: REFUSED ({type(exc).__name__})\n  - {console_safe(str(exc))}")
        return 1

    return _report(claim, args, claim_path)


def _report(claim: dict, args: argparse.Namespace, claim_path: Path) -> int:
    if args.json:
        print(json.dumps(claim, indent=2))
        return 0
    suffix = " (dry-run; nothing written)" if args.dry_run else ""
    print(f"seat_protocol: {args.operation} OK{suffix}")
    print(f"  claim_file={claim_path}")
    print(f"  status={claim.get(STATUS)} who_is_boss_now={claim.get(WHO_IS_BOSS_NOW)}")
    print(f"  claim_queue={claim.get(CLAIM_QUEUE)}")
    print(f"  as_of_history={len(claim.get(AS_OF_HISTORY, []))} entr(ies)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
