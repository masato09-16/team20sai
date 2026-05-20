import { z } from "zod";

const point2DSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const boundingBoxSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const gridGuideSchema = z.object({
  cell_width_px: z.number().positive(),
  cell_height_px: z.number().positive(),
  origin: point2DSchema,
  columns: z.number().int().min(1),
  rows: z.number().int().min(1),
  rotation_deg: z.number(),
});

const analysisScoresSchema = z.object({
  horizontalness: z.number().min(0).max(1),
  spacing_uniformity: z.number().min(0).max(1),
  size_consistency: z.number().min(0).max(1),
  visibility: z.number().min(0).max(1),
});

const analysisOverlaySchema = z.object({
  image_width: z.number().int().positive(),
  image_height: z.number().int().positive(),
  baseline_y_positions: z.array(z.number()),
  char_boxes: z.array(boundingBoxSchema),
  guide: gridGuideSchema.nullable(),
});

const referenceComparisonSchema = z.object({
  font_similarity: z.number().min(0).max(1),
  iou: z.number().min(0).max(1),
  dice_coefficient: z.number().min(0).max(1),
  pixel_agreement: z.number().min(0).max(1),
  contour_distance_score: z.number().min(0).max(1),
});

export const banshoAnalysisResultSchema = z.object({
  scores: analysisScoresSchema,
  overlay: analysisOverlaySchema,
  notes: z.array(z.string()),
  pipeline_stage: z.enum(["stub", "full"]),
  reference_comparison: referenceComparisonSchema.nullable().optional(),
});

export type BanshoAnalysisResult = z.infer<typeof banshoAnalysisResultSchema>;
export type AnalysisScores = z.infer<typeof analysisScoresSchema>;
export type AnalysisOverlay = z.infer<typeof analysisOverlaySchema>;
export type GridGuide = z.infer<typeof gridGuideSchema>;
export type ReferenceComparison = z.infer<typeof referenceComparisonSchema>;
