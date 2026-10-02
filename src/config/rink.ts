// Rink measurements (docs/02_REGLAMENTO.md). Rule data, not game feel, so not in tuning.ts.
// Values confirmed against World Skate rules are marked (WS); others are reasonable
// references still pending verification (see docs/DECISIONS.md).

export const RINK = {
  /** Inner length/width between boards (m). Reference 40 × 20 (WS range ~34-44 × 17-22). */
  length: 40,
  width: 20,
  /** Radius of the rounded corners (m). [VERIFY] */
  cornerRadius: 1.0,
  /** Board height and thickness (m). Height ~1 m [VERIFY]. */
  boardHeight: 1.0,
  boardThickness: 0.12,
  /** Distance from end board to goal line (m). WS: 2.70-3.30. */
  goalLineFromEnd: 2.8,
  /** Goal cage inner width/height (m). (WS) 1.70 × 1.05. */
  goalWidth: 1.7,
  goalHeight: 1.05,
  /** Goal cage depth at floor level and at crossbar level (m). [VERIFY] */
  goalDepthBottom: 0.92,
  goalDepthTop: 0.5,
  /** Goal post / frame tube diameter (m). */
  goalPostDiameter: 0.076,
  /** Penalty area: 9 m wide (parallel to end board) × 5.4 m deep from goal line. (WS) */
  penaltyAreaWidth: 9,
  penaltyAreaDepth: 5.4,
  /** Spots measured from the goal line centre (m). (WS) */
  penaltySpotDistance: 5.4,
  directFreeHitDistance: 7.4,
  /** Goalkeeper protection half-circle radius from goal line centre (m). [VERIFY] */
  goalkeeperAreaRadius: 1.5,
  /** Centre circle radius (m). (WS) */
  centreCircleRadius: 3,
  /** Painted line width (m). */
  lineWidth: 0.08,
  /** Ball: 155 g, 23 cm circumference. [VERIFY] */
  ballMass: 0.155,
  ballRadius: 0.23 / (2 * Math.PI),
} as const;

export type RinkConfig = typeof RINK;

/** x coordinate of each goal line (sim space: x along length, centre at 0). */
export function goalLineX(side: -1 | 1, rink: RinkConfig = RINK): number {
  return side * (rink.length / 2 - rink.goalLineFromEnd);
}
