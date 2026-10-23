/**
 * Borough bus pages for the map filter. Built from the MTA bus route list
 * (NY Open Data bzwk-3hb4) on 2026-10-23. Ids match the live feed: uppercase,
 * and a Select Bus Service "-SBS" name is the "+" id the feed sends.
 * Temporary shuttles (a name containing "Shuttle", including T102) are left
 * out; a service alert names the shuttle that is running.
 */
export type BusPage = { id: string; label: string; routes: string[] };
export type BusGroup = { id: string; label: string; pages: BusPage[] };

export const BUS_GROUPS: BusGroup[] = [
  {
    "id": "queens",
    "label": "Queens",
    "pages": [
      {
        "id": "queens-1",
        "label": "Q1–Q19",
        "routes": [
          "Q1",
          "Q2",
          "Q3",
          "Q4",
          "Q5",
          "Q6",
          "Q7",
          "Q8",
          "Q9",
          "Q10",
          "Q11",
          "Q12",
          "Q13",
          "Q14",
          "Q15",
          "Q15A",
          "Q16",
          "Q17",
          "Q18",
          "Q19"
        ]
      },
      {
        "id": "queens-2",
        "label": "Q20–Q37",
        "routes": [
          "Q20",
          "Q20A",
          "Q20B",
          "Q21",
          "Q22",
          "Q23",
          "Q24",
          "Q25",
          "Q26",
          "Q27",
          "Q28",
          "Q29",
          "Q30",
          "Q31",
          "Q32",
          "Q33",
          "Q34",
          "Q35",
          "Q36",
          "Q37"
        ]
      },
      {
        "id": "queens-3",
        "label": "Q38–Q58",
        "routes": [
          "Q38",
          "Q39",
          "Q40",
          "Q41",
          "Q42",
          "Q43",
          "Q44+",
          "Q45",
          "Q46",
          "Q47",
          "Q48",
          "Q49",
          "Q50",
          "Q51",
          "Q52+",
          "Q53+",
          "Q54",
          "Q55",
          "Q56",
          "Q58"
        ]
      },
      {
        "id": "queens-4",
        "label": "Q59–Q85",
        "routes": [
          "Q59",
          "Q60",
          "Q61",
          "Q63",
          "Q64",
          "Q65",
          "Q66",
          "Q67",
          "Q69",
          "Q70+",
          "Q72",
          "Q74",
          "Q75",
          "Q76",
          "Q77",
          "Q80",
          "Q82",
          "Q83",
          "Q84",
          "Q85"
        ]
      },
      {
        "id": "queens-5",
        "label": "Q86–Q115",
        "routes": [
          "Q86",
          "Q87",
          "Q88",
          "Q89",
          "Q90",
          "Q98",
          "Q98V",
          "Q100",
          "Q101",
          "Q102",
          "Q103",
          "Q104",
          "Q110",
          "Q111",
          "Q112",
          "Q113",
          "Q114",
          "Q115"
        ]
      }
    ]
  },
  {
    "id": "qm",
    "label": "Queens–Manhattan",
    "pages": [
      {
        "id": "qm-1",
        "label": "QM1–QM31",
        "routes": [
          "QM1",
          "QM2",
          "QM3",
          "QM4",
          "QM5",
          "QM6",
          "QM7",
          "QM8",
          "QM10",
          "QM11",
          "QM12",
          "QM15",
          "QM16",
          "QM17",
          "QM18",
          "QM20",
          "QM21",
          "QM24",
          "QM25",
          "QM31"
        ]
      },
      {
        "id": "qm-2",
        "label": "QM32–X68",
        "routes": [
          "QM32",
          "QM34",
          "QM35",
          "QM36",
          "QM40",
          "QM42",
          "QM44",
          "QM63",
          "QM64",
          "QM65",
          "QM68",
          "X63",
          "X64",
          "X68"
        ]
      }
    ]
  },
  {
    "id": "manhattan",
    "label": "Manhattan",
    "pages": [
      {
        "id": "manhattan-1",
        "label": "M1–M22",
        "routes": [
          "M1",
          "M2",
          "M3",
          "M4",
          "M5",
          "M7",
          "M8",
          "M9",
          "M10",
          "M11",
          "M12",
          "M14A",
          "M14A+",
          "M14D",
          "M14D+",
          "M15",
          "M15+",
          "M20",
          "M21",
          "M22"
        ]
      },
      {
        "id": "manhattan-2",
        "label": "M23+–M102",
        "routes": [
          "M23+",
          "M31",
          "M34+",
          "M34A+",
          "M35",
          "M42",
          "M50",
          "M55",
          "M57",
          "M60+",
          "M66",
          "M72",
          "M79+",
          "M86+",
          "M96",
          "M98",
          "M99",
          "M100",
          "M101",
          "M102"
        ]
      },
      {
        "id": "manhattan-3",
        "label": "M103–M141A",
        "routes": [
          "M103",
          "M104",
          "M106",
          "M116",
          "M125",
          "M141A"
        ]
      }
    ]
  },
  {
    "id": "sim",
    "label": "Manhattan–Staten Island",
    "pages": [
      {
        "id": "sim-1",
        "label": "SIM1–SIM24",
        "routes": [
          "SIM1",
          "SIM1C",
          "SIM2",
          "SIM3",
          "SIM3C",
          "SIM4",
          "SIM4C",
          "SIM4X",
          "SIM5",
          "SIM6",
          "SIM7",
          "SIM8",
          "SIM8X",
          "SIM9",
          "SIM10",
          "SIM11",
          "SIM15",
          "SIM22",
          "SIM23",
          "SIM24"
        ]
      },
      {
        "id": "sim-2",
        "label": "SIM25–SIM35",
        "routes": [
          "SIM25",
          "SIM26",
          "SIM30",
          "SIM31",
          "SIM32",
          "SIM33",
          "SIM33C",
          "SIM34",
          "SIM35"
        ]
      }
    ]
  },
  {
    "id": "brooklyn",
    "label": "Brooklyn",
    "pages": [
      {
        "id": "brooklyn-1",
        "label": "B1–B31",
        "routes": [
          "B1",
          "B2",
          "B3",
          "B4",
          "B6",
          "B7",
          "B8",
          "B9",
          "B11",
          "B12",
          "B13",
          "B14",
          "B15",
          "B16",
          "B17",
          "B20",
          "B24",
          "B25",
          "B26",
          "B31"
        ]
      },
      {
        "id": "brooklyn-2",
        "label": "B32–B57",
        "routes": [
          "B32",
          "B35",
          "B36",
          "B37",
          "B38",
          "B39",
          "B41",
          "B42",
          "B43",
          "B44",
          "B44+",
          "B45",
          "B46",
          "B46+",
          "B47",
          "B48",
          "B49",
          "B52",
          "B54",
          "B57"
        ]
      },
      {
        "id": "brooklyn-3",
        "label": "B60–B99",
        "routes": [
          "B60",
          "B61",
          "B62",
          "B63",
          "B64",
          "B65",
          "B67",
          "B68",
          "B69",
          "B70",
          "B74",
          "B82",
          "B82+",
          "B83",
          "B84",
          "B91",
          "B91A",
          "B92",
          "B98V",
          "B99"
        ]
      },
      {
        "id": "brooklyn-4",
        "label": "B100–B103",
        "routes": [
          "B100",
          "B103"
        ]
      }
    ]
  },
  {
    "id": "bm",
    "label": "Brooklyn–Manhattan",
    "pages": [
      {
        "id": "bm-1",
        "label": "BM1–X38",
        "routes": [
          "BM1",
          "BM2",
          "BM3",
          "BM4",
          "BM5",
          "X27",
          "X28",
          "X37",
          "X38"
        ]
      }
    ]
  },
  {
    "id": "bronx",
    "label": "Bronx",
    "pages": [
      {
        "id": "bronx-1",
        "label": "BX1–BX18",
        "routes": [
          "BX1",
          "BX2",
          "BX3",
          "BX4",
          "BX4A",
          "BX5",
          "BX6",
          "BX6+",
          "BX7",
          "BX8",
          "BX9",
          "BX10",
          "BX11",
          "BX12",
          "BX12+",
          "BX13",
          "BX15",
          "BX16",
          "BX17",
          "BX18"
        ]
      },
      {
        "id": "bronx-2",
        "label": "BX18A–BX36",
        "routes": [
          "BX18A",
          "BX18B",
          "BX19",
          "BX20",
          "BX21",
          "BX22",
          "BX23",
          "BX24",
          "BX25",
          "BX26",
          "BX27",
          "BX28",
          "BX29",
          "BX30",
          "BX31",
          "BX32",
          "BX33",
          "BX34",
          "BX35",
          "BX36"
        ]
      },
      {
        "id": "bronx-3",
        "label": "BX38–BX99",
        "routes": [
          "BX38",
          "BX39",
          "BX40",
          "BX41",
          "BX41+",
          "BX42",
          "BX46",
          "BX99"
        ]
      }
    ]
  },
  {
    "id": "bxm",
    "label": "Bronx–Manhattan",
    "pages": [
      {
        "id": "bxm-1",
        "label": "BXM1–BXM18",
        "routes": [
          "BXM1",
          "BXM2",
          "BXM3",
          "BXM4",
          "BXM6",
          "BXM7",
          "BXM8",
          "BXM9",
          "BXM10",
          "BXM11",
          "BXM18"
        ]
      }
    ]
  },
  {
    "id": "si",
    "label": "Staten Island",
    "pages": [
      {
        "id": "si-1",
        "label": "S40–S79+",
        "routes": [
          "S40",
          "S42",
          "S44",
          "S46",
          "S48",
          "S51",
          "S52",
          "S53",
          "S54",
          "S55",
          "S56",
          "S57",
          "S59",
          "S61",
          "S62",
          "S66",
          "S74",
          "S76",
          "S78",
          "S79+"
        ]
      },
      {
        "id": "si-2",
        "label": "S81–S98",
        "routes": [
          "S81",
          "S84",
          "S86",
          "S89",
          "S90",
          "S91",
          "S92",
          "S93",
          "S94",
          "S96",
          "S98"
        ]
      }
    ]
  }
];
