import EventPageClient from "./EventClient";

interface PageParams {
  token: string;
}

export default async function EventPage({ params }: { params: Promise<PageParams> }) {
  const resolved = await params;
  return <EventPageClient token={resolved.token} />;
}