export type EventCategory = "EstBirding" | "Muud";

export interface EventItem {
  id: string;
  title: string;
  startAt: string;
  endAt?: string;
  locationName: string;
  lat: number;
  lng: number;
  category: EventCategory;
  imageUrl: string;
  description?: string;
  organizerName?: string;
  url?: string;
  isPublished?: boolean;
}

const baseDate = new Date();
baseDate.setHours(0, 0, 0, 0);

function createIso(daysFromToday: number, hour: number, minute: number): string {
  const d = new Date(baseDate);
  d.setDate(baseDate.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const sampleEvents: EventItem[] = [
  {
    id: "evt-1",
    title: "Hommikune linnuvaatlus Algul",
    startAt: createIso(2, 7, 0),
    locationName: "Pärnumaa",
    lat: 58.3859,
    lng: 24.4971,
    category: "EstBirding",
    imageUrl: "https://images.unsplash.com/photo-1516117172878-fd2c41f4a759?w=360&h=280&fit=crop",
    description: "Rahulik hommikune retk rannikulindude vaatlemiseks.",
  },
  {
    id: "evt-2",
    title: "Kevadine linnuretk Lahemaal",
    startAt: createIso(5, 9, 30),
    locationName: "Lahemaa",
    lat: 59.5756,
    lng: 25.8258,
    category: "EstBirding",
    imageUrl: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=360&h=280&fit=crop",
  },
  {
    id: "evt-3",
    title: "Õhtune linnutuur Hiiumaal",
    startAt: createIso(9, 18, 0),
    locationName: "Hiiumaa",
    lat: 58.8665,
    lng: 22.5931,
    category: "Muud",
    imageUrl: "https://images.unsplash.com/photo-1444464666168-49d633b86797?w=360&h=280&fit=crop",
  },
  {
    id: "evt-4",
    title: "Röövlindude vaatlus Matsalus",
    startAt: createIso(-4, 16, 0),
    locationName: "Matsalu",
    lat: 58.7611,
    lng: 23.6136,
    category: "EstBirding",
    imageUrl: "https://images.unsplash.com/photo-1501706362039-c6e13b4f69b7?w=360&h=280&fit=crop",
  },
  {
    id: "evt-5",
    title: "Loodusfotopäev Alam-Pedjal",
    startAt: createIso(-8, 11, 15),
    locationName: "Alam-Pedja",
    lat: 58.4596,
    lng: 26.0005,
    category: "Muud",
    imageUrl: "https://images.unsplash.com/photo-1421789665209-c9b2a435e3dc?w=360&h=280&fit=crop",
  },
  {
    id: "evt-6",
    title: "Rannaniidu loendus Saaremaal",
    startAt: createIso(14, 8, 45),
    locationName: "Saaremaa",
    lat: 58.4840,
    lng: 22.6136,
    category: "EstBirding",
    imageUrl: "https://images.unsplash.com/photo-1452570053594-1b985d6ea890?w=360&h=280&fit=crop",
  },
  {
    id: "evt-7",
    title: "Noorte ornitoloogide õppepäev",
    startAt: createIso(19, 13, 0),
    locationName: "Tartu",
    lat: 58.3776,
    lng: 26.7290,
    category: "Muud",
    imageUrl: "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?w=360&h=280&fit=crop",
  },
  {
    id: "evt-8",
    title: "Talvine vaatlusretk Soomaa serval",
    startAt: createIso(-16, 10, 0),
    locationName: "Soomaa",
    lat: 58.4786,
    lng: 25.0198,
    category: "EstBirding",
    imageUrl: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=360&h=280&fit=crop",
  },
];
