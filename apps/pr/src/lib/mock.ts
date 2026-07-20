import films from "@/mock/films.json";
import missions from "@/mock/missions.json";
import timeline from "@/mock/timeline.json";
import crew from "@/mock/crew.json";
import reviews from "@/mock/reviews.json";
import assets from "@/mock/assets.json";
import activity from "@/mock/activity.json";
import recommendations from "@/mock/recommendations.json";
import type {
  ActivityItem,
  AiRecommendations,
  Asset,
  Film,
  Mission,
  Review,
  TeamMember,
  TimelineEntry,
} from "@/types";

/**
 * The mock data layer. Every page reads through these functions — when the
 * backend arrives, this file becomes the API client and nothing else moves.
 */
export const getFilm = (): Film => films[0] as Film;
export const getMissions = (): Mission[] => missions as Mission[];
export const getTimeline = (): TimelineEntry[] => timeline as TimelineEntry[];
export const getTeam = (): TeamMember[] => crew as TeamMember[];
export const getReviews = (): Review[] => reviews as Review[];
export const getAssets = (): Asset[] => assets as Asset[];
export const getActivity = (): ActivityItem[] => activity as ActivityItem[];
export const getRecommendations = (): AiRecommendations =>
  recommendations as AiRecommendations;

export const formatMoney = (n: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(n);

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const daysUntil = (iso: string): number =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
