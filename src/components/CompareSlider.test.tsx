import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompareSlider } from "./CompareSlider";

describe("CompareSlider", () => {
  it("renders the photo, its credit and a centred keyboard slider", () => {
    const html = renderToStaticMarkup(
      <CompareSlider photoUrl="https://example.test/p.jpg" photoAlt="Corner of W 44 St" photoCredit="Mapillary, CC-BY-SA" orientation="beside" />,
    );
    expect(html).toContain('src="https://example.test/p.jpg"');
    expect(html).toContain("Mapillary, CC-BY-SA");
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain('aria-valuenow="50"');
  });

  it("shows placeholders when there is no photo or 3D view", () => {
    const html = renderToStaticMarkup(<CompareSlider photoUrl={null} photoAlt="No photo" />);
    expect(html).toContain("No photo here");
    expect(html).toContain("3D street view goes here");
    expect(html).toContain('aria-orientation="vertical"');
  });
});
