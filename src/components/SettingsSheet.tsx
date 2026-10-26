import { useState } from "react";
import { Settings, X } from "lucide-react";
import { PullSheet } from "@/components/PullSheet";
import { SettingsBody } from "@/components/SettingsBody";
import type { SheetLevel } from "@/components/sheetSwipe";
import { useMenuT } from "@/lib/i18n/menuText";

/**
 * On a phone's home, language and the QR code come up from behind the chat
 * from the Settings chip, so the top right keeps only view, zoom and north
 * (owner, 2026-10-25). Swiping it all the way down closes it.
 */
export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const t = useMenuT();
  const [level, setLevel] = useState<SheetLevel>(1);
  return (
    <PullSheet testId="settings-sheet" label={t("settings")} level={level} onLevel={(l) => (l ? setLevel(l) : onClose())}
      header={
        <div className="flex min-h-12 items-center gap-3 px-1">
          <Settings className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />
          <span className="flex-1 text-[15px] font-semibold text-slate-100">{t("settings")}</span>
          <button type="button" aria-label={`Close ${t("settings")}`} onClick={onClose} className="task-action task-close">
            <X className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      }>
      <div className="pull-sheet-body flex flex-col gap-2">
        <SettingsBody />
      </div>
    </PullSheet>
  );
}
