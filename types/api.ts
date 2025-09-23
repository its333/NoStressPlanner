// types/api.ts
// Centralized type definitions for API responses

export interface ApiResponse {
  event: {
    id: string;
    title: string;
    description?: string;
    phase: "VOTE" | "PICK_DAYS" | "RESULTS" | "FAILED" | "FINALIZED";
    startDate: string;
    endDate: string;
    voteDeadline?: string;
    finalDate?: string;
    requireLoginToAttend: boolean;
    showResultsToEveryone: boolean;
  };
  phaseSummary: {
    inCount: number;
    totalParticipants: number;
    quorum: number;
    voteDeadline?: string;
    earliestAll?: string | null;
    earliestMost?: string | null;
    topDates: Array<{
      date: string;
      available: number;
      totalAttendees: number;
    }>;
  };
  attendeeNames: Array<{
    id: string;
    label: string;
    slug: string;
    takenBy: string | null;
    claimedByLoggedUser: boolean;
  }>;
  you?: {
    id: string;
    displayName: string;
    attendeeName: { label: string };
    anonymousBlocks: boolean;
  };
  initialBlocks: string[];
  yourVote?: boolean | null;
  isHost: boolean;
  availability: Array<{ date: string; available: number }>;
  availabilityProgress: {
    totalEligible: number;
    completedAvailability: number;
    notSetYet: number;
    isComplete: boolean;
  };
  attendeeDetails: Array<{
    id: string;
    name: string;
    hasVoted: boolean;
    vote: boolean | null;
    hasSetAvailability: boolean;
  }>;
}

export interface CreateEventRequest {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  voteDeadline: string;
  quorum: number;
  requireLoginToAttend?: boolean;
  attendeeNames: Array<{
    label: string;
    slug: string;
  }>;
}

export interface JoinEventRequest {
  nameSlug: string;
  displayName: string;
  timeZone?: string;
}

export interface VoteRequest {
  in: boolean;
}

export interface BlocksRequest {
  dates: string[];
  anonymous?: boolean;
}

export interface SetFinalDateRequest {
  finalDate: string;
}

export interface SwitchNameRequest {
  newNameSlug: string;
}

export interface ApiError {
  error: string | {
    fieldErrors?: Record<string, string[]>;
    formErrors?: string[];
  };
}

export interface ApiSuccess<T = any> {
  ok: true;
  data?: T;
  message?: string;
}
