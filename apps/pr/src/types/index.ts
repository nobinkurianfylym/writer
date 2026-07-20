/**
 * PR.FYLYM domain types. The MVP reads these from JSON mocks (src/mock);
 * later phases swap the loaders in src/lib/mock.ts for real APIs without
 * touching the components.
 */

export interface Film {
  id: string;
  title: string;
  genre: string;
  language: string;
  budget: number;
  marketingBudget: number;
  releaseDate: string;
  healthScore: number;
  phase: CampaignPhase;
}

export const CAMPAIGN_PHASES = [
  "Announcement",
  "Poster",
  "Trailer",
  "Music",
  "Release",
  "OTT",
  "Awards",
] as const;

export type CampaignPhase = (typeof CAMPAIGN_PHASES)[number];

export type PhaseStatus = "done" | "active" | "upcoming";

export interface TimelineEntry {
  id: string;
  phase: CampaignPhase;
  date: string;
  status: PhaseStatus;
  summary: string;
}

export interface Mission {
  id: string;
  title: string;
  detail: string;
  impact: "High" | "Medium" | "Low";
  due: string;
  done: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  status: "Active" | "Invited" | "Paused";
  contribution: number;
}

export interface Review {
  id: string;
  quote: string;
  publication: string;
  critic: string;
  rating: number;
  date: string;
}

export type AssetType = "Poster" | "Trailer" | "EPK" | "Stills" | "Logo";

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  format: string;
  updated: string;
}

export interface ActivityItem {
  id: string;
  when: string;
  text: string;
}

export interface AiRecommendations {
  today: string;
  nextAction: string;
  summary: string;
}
