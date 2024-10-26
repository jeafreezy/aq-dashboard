/**
 * This is where we import the required libraries.
 */
import { useEffect, useMemo, useState } from "react";
import maplibregl, {
  GeolocateControl,
  Map,
  NavigationControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * These are constant variables for easy reuse.
 */
const WORLD_AIR_QUALITY_BASE_API_URL: string = "https://api.waqi.info/v2/";
const WORLD_AIR_QUALITY_API_TOKEN: string =
  "e4e922828e41a73cfe4645c0db52103229422e8a";

/**
 * This is a Typescript type for a single station.
 */

type TStation = {
  uid: string;
  aqi: string;
  lat: number;
  lon: number;
  station: {
    name: string;
  };
};

/**
 * This is a function that convers the stations data to a GeoJSON FeatureCollection for easy rendering on the map.
 * @param stations The stations to convert to GeoJSON.
 */
function stationsToGeoJSON(stations: TStation[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((station: TStation) => ({
      type: "Feature",
      properties: {
        stationName: station.station.name,
        uid: station.uid,
        aqi: Number(station.aqi),
      },
      geometry: {
        type: "Point",
        coordinates: [station.lon, station.lat],
      },
    })),
  };
}

/**
 * This is a function that gets the Air Quality information for a single station/point on the map.
 * @param stationUID The unique ID of the station.
 */
async function getMarkerAQI(stationUID: string) {
  return (
    await fetch(
      "https://api.waqi.info/feed/@" +
      stationUID +
      "/?token=" +
      WORLD_AIR_QUALITY_API_TOKEN,
    )
  ).json();
}

/**
 * This is a function that populates the points on the map.
 * @param map The maplibre map instance.
 * @param bounds The current bounding box of the map.
 * @param setSelectedStationInfo The callback function to update the state with the clicked/selected station.
 */

async function populateMarkers(
  map: maplibregl.Map,
  bounds: string,
  setSelectedStationInfo: (station: TSelectedStation) => void,
) {
  return fetch(
    `${WORLD_AIR_QUALITY_BASE_API_URL}map/bounds/?latlng=${bounds}&token=${WORLD_AIR_QUALITY_API_TOKEN}`,
  )
    .then((data) => data.json())
    .then((stations) => {
      if (stations.status != "ok") throw stations.data;

      const geoJSON = stationsToGeoJSON(stations.data);

      if (map.getSource("stations")) {
        const source = map.getSource("stations") as maplibregl.GeoJSONSource;
        source.setData(geoJSON);
      } else {

        map.addSource("stations", {
          type: "geojson",
          data: geoJSON,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "stations",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#fff",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              20,
              100,
              30,
              750,
              40,
            ],
          },
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "stations",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-size": 12,
          },
        });

        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "stations",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "step",
              ["get", "aqi"],
              "#9BD74E",
              50,
              "#f1f075",
              100,
              "#f28cb1",
              150,
              "#e55e5e",
              200,
              "#d4201f",
              300,
              "#8b0000",
            ],
            "circle-radius": 5,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fff",
          },
        });

        map.on("click", "unclustered-point", async (e: any) => {
          const coordinates = e.features[0].geometry.coordinates.slice();
          const { stationName, uid } = e.features[0].properties;

          new maplibregl.Popup()
            .setLngLat(coordinates)
            .setHTML(`<strong style='color:black;'>${stationName}</strong>`)
            .addTo(map);
          // update the state with the data clicked and display on the sidebar.
          const stationInfo = await getMarkerAQI(uid);
          setSelectedStationInfo(stationInfo?.data);
        });

        map.on("click", "clusters", (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: ["clusters"],
          });
          const clusterId = features[0].properties.cluster_id;
          const source = map.getSource("stations") as maplibregl.GeoJSONSource;

          source.getClusterExpansionZoom(clusterId);
        });

        map.on("mouseenter", "clusters", () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", "clusters", () => {
          map.getCanvas().style.cursor = "";
        });
      }
    })
    .catch((error) => {
      console.error("Error fetching station data:", error);
    });
}

/**
 * This functions takes an air quality index and returns some information about it.
 * @param aqi The Air Quality Index (AQI) value.
 * @returns The category of the value, the color code and a message.
 */
const getAirQualitySituation = (
  aqi: number = 0,
): { text: string; color: string; message: string } => {
  if (aqi <= 50) {
    return {
      text: "Good",
      color: "green",
      message: `An AQI of ${aqi}µg/m³ indicates that the air quality is healthy.`,
    };
  } else if (aqi > 50 && aqi <= 100) {
    return {
      text: "Moderate",
      color: "orange",
      message: `An AQI of ${aqi}µg/m³ indicates that the air quality is moderate.`,
    };
  } else {
    return {
      text: "Poor",
      color: "red",
      message: `An AQI of ${aqi}µg/m³ indicates that the air quality is unhealthy.`,
    };
  }
};

/**
 * This is a Typescript type that represents the data type of the API response for a selected station.
 */
type TSelectedStation = {
  aqi: number;
  city: {
    name: string;
    url: string;
  };
  attributions: { logo: string; name: string; url: string }[];
  time: {
    iso: string;
    s: string;
  };
  forecast: {
    daily: {
      o3: { avg: number; day: string; max: number; min: number }[];
      pm10: { avg: number; day: string; max: number; min: number }[];
      pm25: { avg: number; day: string; max: number; min: number }[];
      no2: { avg: number; day: string; max: number; min: number }[];
    };
  };
  iaqi: {
    pm10?: {
      v: number;
    };
    pm25?: {
      v: number;
    };
    no2?: {
      v: number;
    };
    o3?: {
      v: number;
    };
  };
};

/**
 * This is a React Component to write our application code.
 */
function App() {
  // Local states

  const [map, setMap] = useState<Map | null>(null);
  const [selectedStationInfo, setSelectedStationInfo] =
    useState<null | TSelectedStation>(null);
  const [activePollutant, setActivePollutant] = useState<string>("");
  // This useEffect is used to load the map
  useEffect(() => {
    if (map) return;
    // This is used to initialize the map and also update the state with the initialized map. The library used here is Maplibre GL JS (https://maplibre.org).
    setMap(
      new maplibregl.Map({
        container: "map",
        style:
          "https://tiles.basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json", // The url to the style i.e basemap that is displayed.
        center: [20.11, 49.35], // The center of the map around Europe.
        zoom: 10, // The zoom level of the map.
      })
        .addControl(
          // To zoom in and out.
          new NavigationControl(),
        )
        .addControl(
          // To Geolocate
          new GeolocateControl({
            positionOptions: {
              enableHighAccuracy: true,
            },
          }),
        ),
    );
  }, [map]);

  useEffect(() => {
    if (!map) return;
    // Show it immediately after loading
    // Get the bounds of the map as the user pans around
    const bounds = map.getBounds();
    const apiBounds =
      bounds.getNorth() +
      "," +
      bounds.getWest() +
      "," +
      bounds.getSouth() +
      "," +
      bounds.getEast();

    map.on("load", () => {
      populateMarkers(map, apiBounds, setSelectedStationInfo);
    });
    // //Fetch new data when panning
    // setTimeout(function () {
    //   map.on("moveend", () => {
    //     populateMarkers(map, apiBounds, setSelectedStationInfo);
    //   });
    // }, 5000);
  }, [map]);

  useEffect(() => {
    // Use the user location as the default air quality information when the application loads
    const getUserCurrentLocationAQI = async () => {
      const data = await (
        await fetch(
          `https://api.waqi.info/feed/here/?token=${WORLD_AIR_QUALITY_API_TOKEN}`,
        )
      ).json();
      setSelectedStationInfo(data.data);
    };
    getUserCurrentLocationAQI();
  }, []);

  // set the first available forecast data as the default selected
  useEffect(() => {
    if (!selectedStationInfo?.forecast) return;
    if (activePollutant !== "") return;
    if (selectedStationInfo.forecast.daily.no2) {
      setActivePollutant("no2");
    } else if (selectedStationInfo.forecast.daily.pm10) {
      setActivePollutant("pm10");
    } else if (selectedStationInfo.forecast.daily.pm25) {
      setActivePollutant("pm25");
    } else if (selectedStationInfo.forecast.daily.o3) {
      setActivePollutant("o3");
    }
  }, [selectedStationInfo?.forecast, activePollutant]);

  // A memo to render the side panel contents.
  const renderSidePanel = useMemo(() => {
    const backgroundColors: Record<string, string> = {
      green: "bg-[#9BD74E]",
      red: "bg-red-500",
      orange: "bg-orange-500",
    };
    const { color, text, message } = getAirQualitySituation(
      selectedStationInfo?.aqi as number,
    );

    return (
      <div className="col-span-3 space-y-1.5 h-[95dvh] overflow-scroll bg-[#383841]">
        <div
          className={`text-black p-6 flex flex-col gap-y-3 ${backgroundColors[color]}`}
        >
          <a href={selectedStationInfo?.city.url} target="_blank">
            <p className="text-base">{selectedStationInfo?.city.name}</p>
          </a>
          <p className="text-3xl">{text}</p>
          <p className="text-3xl">
            AQI{" "}
            <span className="font-semibold">{selectedStationInfo?.aqi}</span>
          </p>
          <p className="text-base">{message}</p>
        </div>
        {/* Metrics */}
        <div className="p-4 flex flex-col gap-y-4 bg-black">
          <small>Last updated: {selectedStationInfo?.time.s}</small>
          <p className="text-base">Main Pollutants</p>
          <ul className="flex items-center justify-between gap-x-1">
            {/* PM 2.5 */}
            {selectedStationInfo?.iaqi.pm25 && (
              <li className="flex flex-col gap-y-2 items-center">
                <span className="text-base bg-[#383841] px-4 py-1  rounded-2xl">
                  {selectedStationInfo?.iaqi.pm25.v}
                </span>
                <span className="text-xs font-light text-[#9D9DA1]">
                  PM 2.5
                </span>
              </li>
            )}

            {/* PM 10 */}
            {selectedStationInfo?.iaqi.pm10 && (
              <li className="flex flex-col gap-y-2 items-center">
                <span className="text-base bg-[#383841] px-4 py-1  rounded-2xl">
                  {selectedStationInfo?.iaqi.pm10.v}
                </span>
                <span className="text-xs font-light text-[#9D9DA1]">PM 10</span>
              </li>
            )}

            {/* NO2 */}
            {selectedStationInfo?.iaqi.no2 && (
              <li className="flex flex-col gap-y-2 items-center">
                <span className="text-base bg-[#383841] px-4 py-1  rounded-2xl">
                  {selectedStationInfo?.iaqi.no2.v}
                </span>
                <span className="text-xs font-light text-[#9D9DA1]">NO2</span>
              </li>
            )}
            {/* OZONE */}
            {selectedStationInfo?.iaqi.o3 && (
              <li className="flex flex-col gap-y-2 items-center">
                <span className="text-base bg-[#383841] px-4 py-1  rounded-2xl">
                  {selectedStationInfo?.iaqi.o3.v}
                </span>
                <span className="text-xs font-light text-[#9D9DA1]">Ozone</span>
              </li>
            )}
          </ul>
        </div>

        {/* Forecast Chart */}
        {selectedStationInfo?.forecast?.daily ? (
          <div className="p-4 flex flex-col gap-y-4 bg-black">
            <p className="text-base">Air Quality Forecast</p>
            {/* Tabs */}
            <ul className="flex items-center px-2 py-1 rounded-3xl justify-between gap-x-1 bg-[#383841] text-[#9D9DA1]">
              {/* PM 2.5 */}
              {selectedStationInfo.forecast.daily.pm25 && (
                <li
                  className={`cursor-pointer p-2  text-sm ${activePollutant === "pm25" && "bg-black text-white  rounded-3xl"}`}
                  onClick={() => setActivePollutant("pm25")}
                >
                  PM 2.5
                </li>
              )}

              {/* PM 10 */}
              {selectedStationInfo.forecast.daily.pm10 && (
                <li
                  className={`cursor-pointer p-2 text-sm ${activePollutant === "pm10" && "bg-black text-white cursor-pointer rounded-3xl"}`}
                  onClick={() => setActivePollutant("pm10")}
                >
                  PM10
                </li>
              )}

              {/* NO2 */}
              {selectedStationInfo.forecast.daily.no2 && (
                <li
                  className={`cursor-pointer p-2 text-sm ${activePollutant === "no2" && "bg-black text-white cursor-pointer rounded-3xl"}`}
                  onClick={() => setActivePollutant("no2")}
                >
                  NO2
                </li>
              )}
              {/* OZONE */}
              {selectedStationInfo.forecast.daily.o3 && (
                <li
                  className={`cursor-pointer p-2 text-sm ${activePollutant === "o3" && "bg-black text-white cursor-pointer rounded-3xl"}`}
                  onClick={() => setActivePollutant("o3")}
                >
                  Ozone
                </li>
              )}
            </ul>
            {/* Chart */}
            <div className="w-full h-[300px]">
              {activePollutant ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    // @ts-expect-error bad type definition
                    data={selectedStationInfo.forecast.daily[activePollutant]}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="1 1" />
                    <XAxis
                      dataKey="day"
                      stroke="#fff"
                      tick={{ fill: "#fff" }}
                      tickLine={{ stroke: "#fff" }}
                      axisLine={{ stroke: "#fff" }}
                      dy={10}
                    />
                    <YAxis
                      stroke="#fff"
                      tick={{ fill: "#fff" }}
                      tickLine={{ stroke: "#fff" }}
                      axisLine={{ stroke: "#fff" }}
                      dx={-10}
                    />
                    {/* @ts-expect-error bad type definition */}
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="avg" stroke="#8884d8" />
                    <Line type="monotone" dataKey="max" stroke="#82ca9d" />
                    <Line type="monotone" dataKey="min" stroke="#ff7300" />
                  </LineChart>
                </ResponsiveContainer>
              ) : null}
            </div>
            {/*  Attributions  */}
            <small className="text-xs">Attributions:</small>
            <ul className="text-xs">
              {selectedStationInfo?.attributions.map((attribution, id) => (
                <li key={id} className="flex items-center gap-x-2">
                  {attribution.logo && (
                    <img
                      src={`https://aqicn.org/images/feeds/${attribution.logo}`}
                      width={20}
                      height={20}
                    ></img>
                  )}
                  <small>
                    <a href={attribution.url} target="_blank">
                      {attribution.name}
                    </a>
                  </small>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }, [selectedStationInfo, activePollutant]);

  return (
    <main className="bg-black text-white">
      <header className="h-14 flex items-center px-6 ">
        <p>My Air Quality Monitoring Dashboard</p>
      </header>
      <div className="w-full h-screen grid grid-cols-9">
        {/* This is the sidebar where the information about the air quality is presented.*/}
        {renderSidePanel}
        {/* This is the html div element containing the map. */}
        <div id="map" className="col-span-6 w-full h-[95dvh]"></div>
      </div>
    </main>
  );
}

// Exporting it, so it can be imported and rendered in the 'main.tsx' file.
export default App;

/**
 * This is a custom Tooltip Component for the chart.
 */
const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active: boolean;
  payload: Record<string, string>[];
  label: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-lg">
        <p className="text-sm font-bold text-gray-700">{label}</p>
        <p className="text-sm text-gray-500">Avg: {payload[0].value}</p>
        <p className="text-sm text-gray-500">Max: {payload[1].value}</p>
        <p className="text-sm text-gray-500">Min: {payload[2].value}</p>
      </div>
    );
  }
  return null;
};
