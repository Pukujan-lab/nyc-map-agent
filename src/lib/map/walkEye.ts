/** Where street view is standing. The walk loop mutates this object; null when not walking. */
let eye: { lon: number; lat: number } | null = null;

export function setWalkEye(next: { lon: number; lat: number } | null): void {
  eye = next;
}

export function walkEye(): { lon: number; lat: number } | null {
  return eye;
}
