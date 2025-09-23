export type AttendeeNameStatus = {
  id: string;
  label: string;
  slug: string;
  takenBy: 'taken' | 'claimed' | null;
  claimedByLoggedUser: boolean;
};

export interface JoinSuccessResponse {
  ok: true;
  attendeeId: string;
  mode: 'created' | 'already_joined' | 'switched';
  you: {
    id: string;
    displayName: string;
    timeZone: string;
    anonymousBlocks: boolean;
    attendeeName: {
      id: string;
      label: string;
      slug: string;
    };
  } | null;
  attendeeNames: AttendeeNameStatus[];
  initialBlocks: string[];
  yourVote: boolean | null;
  message?: string;
}

export type JoinResponse =
  | JoinSuccessResponse
  | {
      ok?: false;
      error: string;
    };
