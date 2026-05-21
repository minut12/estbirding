const WINDY_URL =
  'https://embed.windy.com/embed2.html?lat=58.6&lon=25.5&detailLat=58.6&detailLon=25.5&width=650&height=450&zoom=4&level=850h&overlay=wind&product=ecmwf&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km/h&metricTemp=°C&radarRange=-1';

export default function WindyChart() {
  return (
    <div className="flex flex-col gap-2 w-full max-w-full overflow-hidden">
      <h3 className="text-base font-semibold">
        Sünoptiline tuulekaart 850 hPa rõhupinnal
      </h3>
      <iframe
        src={WINDY_URL}
        title="850 hPa tuulekaart — Windy.com"
        loading="lazy"
        width="100%"
        height="380"
        className="block w-full max-w-full rounded-md border-0"
        style={{ border: 0, maxWidth: '100%' }}
      />
      <p className="text-xs text-muted-foreground">
        Allikas: Windy.com · ECMWF mudel · Roheliste joonte suund näitab tuule liikumist; mõõtkavad oma menüüs.
      </p>
    </div>
  );
}
