export type EventCategory = "EstBirding" | "Muud";

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  category: EventCategory;
  organizer_name: string | null;
  url: string | null;
  image_url: string | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventInsert = {
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  location_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  category?: EventCategory;
  organizer_name?: string | null;
  url?: string | null;
  image_url?: string | null;
  is_published?: boolean;
};

export type EventUpdate = Partial<EventInsert>;
