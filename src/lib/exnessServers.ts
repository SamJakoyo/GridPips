export interface ExnessServerGroup {
  label: string;
  servers: string[];
}

function buildRange(prefix: string, start: number, end: number): string[] {
  const out: string[] = [];
  for (let i = start; i <= end; i += 1) {
    out.push(`${prefix}${i}`);
  }
  return out;
}

export const EXNESS_MT5_SERVER_GROUPS: ExnessServerGroup[] = [
  {
    label: 'Exness Global — Live Real (MT5Real1 – MT5Real50)',
    servers: buildRange('Exness-MT5Real', 1, 50),
  },
  {
    label: 'Exness Global — Demo Trial (MT5Trial1 – MT5Trial30)',
    servers: buildRange('Exness-MT5Trial', 1, 30),
  },
  {
    label: 'Exness Kenya (ExnessKE) — Real & Trial',
    servers: [
      ...buildRange('ExnessKE-MT5Real', 1, 20),
      ...buildRange('ExnessKE-MT5Trial', 1, 10),
    ],
  },
  {
    label: 'Exness Seychelles (ExnessSC) — Real & Trial',
    servers: [
      ...buildRange('ExnessSC-MT5Real', 1, 30),
      ...buildRange('ExnessSC-MT5Trial', 1, 15),
    ],
  },
  {
    label: 'Exness BVI (ExnessVG) — Real & Trial',
    servers: [
      ...buildRange('ExnessVG-MT5Real', 1, 25),
      ...buildRange('ExnessVG-MT5Trial', 1, 15),
    ],
  },
  {
    label: 'Exness South Africa (ExnessZA) — Real & Trial',
    servers: [
      ...buildRange('ExnessZA-MT5Real', 1, 15),
      ...buildRange('ExnessZA-MT5Trial', 1, 10),
    ],
  },
  {
    label: 'Exness Mauritius (ExnessMU) — Real & Trial',
    servers: [
      ...buildRange('ExnessMU-MT5Real', 1, 15),
      ...buildRange('ExnessMU-MT5Trial', 1, 10),
    ],
  },
  {
    label: 'Exness Curaçao / BV (ExnessBV) — Real & Trial',
    servers: [
      ...buildRange('ExnessBV-MT5Real', 1, 15),
      ...buildRange('ExnessBV-MT5Trial', 1, 10),
    ],
  },
  {
    label: 'Exness Cyprus (ExnessCY) — Real & Trial',
    servers: [
      ...buildRange('ExnessCY-MT5Real', 1, 15),
      ...buildRange('ExnessCY-MT5Trial', 1, 10),
    ],
  },
  {
    label: 'Exness Jordan (ExnessJO) — Real & Trial',
    servers: [
      ...buildRange('ExnessJO-MT5Real', 1, 15),
      ...buildRange('ExnessJO-MT5Trial', 1, 10),
    ],
  },
];

export const ALL_EXNESS_MT5_SERVERS: string[] = EXNESS_MT5_SERVER_GROUPS.flatMap(
  (group) => group.servers
);

export const BARE_EXNESS_SERVER_PREFIX_RE = /^Exness([A-Z]{2})?-MT5(Real|Trial)$/i;
