import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import RNWebView, { type WebViewProps } from 'react-native-webview';

interface WebViewHandle {
  injectJavaScript: (script: string) => void;
}

const TypedWebView = RNWebView as unknown as React.ComponentType<
  WebViewProps & { ref?: React.Ref<WebViewHandle> }
>;

interface MapPoint {
  latitude: number;
  longitude: number;
}

interface MobileLiveMapProps {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  destLabel: string;
  geofenceRadiusMeters: number;
  currentLat?: number | null;
  currentLng?: number | null;
  isInsideGeofence?: boolean;
  breadcrumbs: MapPoint[];
  height?: number;
}

const BASE_LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #e2e8f0; }
    .pin {
      display:flex;align-items:center;justify-content:center;
      padding:2px 7px;border-radius:999px;color:#fff;font-family:sans-serif;
      font-size:10px;font-weight:700;border:2px solid #fff;
      box-shadow:0 2px 8px rgba(15,23,42,0.35);white-space:nowrap;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', { zoomControl: false }).setView([-6.198, 106.82], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    var layerGroup = L.layerGroup().addTo(map);
    var didInitialFit = false;

    function badgeIcon(text, color) {
      return L.divIcon({
        className: 'custom-pin',
        html: '<div class="pin" style="background:' + color + ';">' + text + '</div>',
        iconSize: [52, 22],
        iconAnchor: [26, 11]
      });
    }

    window.renderTrackingState = function(state) {
      layerGroup.clearLayers();
      var pts = [];

      L.marker([state.originLat, state.originLng], { icon: badgeIcon('START', '#475569') }).addTo(layerGroup);
      pts.push([state.originLat, state.originLng]);

      L.circle([state.destLat, state.destLng], {
        radius: state.geofenceRadiusMeters || 150,
        color: state.isInsideGeofence ? '#10b981' : '#0d9488',
        fillColor: state.isInsideGeofence ? '#10b981' : '#14b8a6',
        fillOpacity: 0.18,
        dashArray: '6 4',
        weight: 2
      }).addTo(layerGroup);

      L.marker([state.destLat, state.destLng], { icon: badgeIcon('TUJUAN', '#e11d48') }).addTo(layerGroup);
      pts.push([state.destLat, state.destLng]);

      var trail = (state.breadcrumbs || []).map(function(b) { return [b.latitude, b.longitude]; });
      if (state.currentLat != null && state.currentLng != null) {
        trail.push([state.currentLat, state.currentLng]);
      }
      if (trail.length >= 2) {
        L.polyline(trail, { color: '#0d9488', weight: 4, opacity: 0.9 }).addTo(layerGroup);
      }

      if (state.currentLat != null && state.currentLng != null) {
        L.polyline([[state.currentLat, state.currentLng], [state.destLat, state.destLng]], {
          color: '#94a3b8', weight: 2, dashArray: '5 7'
        }).addTo(layerGroup);
        L.marker([state.currentLat, state.currentLng], { icon: badgeIcon('LIVE', '#0284c7') }).addTo(layerGroup);
        pts.push([state.currentLat, state.currentLng]);
      }

      if (!didInitialFit && pts.length > 0) {
        map.fitBounds(L.latLngBounds(pts), { padding: [26, 26], maxZoom: 16 });
        didInitialFit = true;
      } else if (state.currentLat != null && state.currentLng != null) {
        map.panTo([state.currentLat, state.currentLng], { animate: true });
      }
    };
  </script>
</body>
</html>`;

export const MobileLiveMap: React.FC<MobileLiveMapProps> = ({
  originLat,
  originLng,
  destLat,
  destLng,
  destLabel,
  geofenceRadiusMeters,
  currentLat,
  currentLng,
  isInsideGeofence,
  breadcrumbs,
  height = 250,
}) => {
  const webViewRef = useRef<WebViewHandle | null>(null);

  const payload = useMemo(
    () =>
      JSON.stringify({
        originLat,
        originLng,
        destLat,
        destLng,
        destLabel,
        geofenceRadiusMeters,
        currentLat: currentLat ?? null,
        currentLng: currentLng ?? null,
        isInsideGeofence: !!isInsideGeofence,
        breadcrumbs,
      }),
    [originLat, originLng, destLat, destLng, destLabel, geofenceRadiusMeters, currentLat, currentLng, isInsideGeofence, breadcrumbs]
  );

  const pushStateToMap = () => {
    webViewRef.current?.injectJavaScript(`
      if (window.renderTrackingState) {
        window.renderTrackingState(${payload});
      }
      true;
    `);
  };

  useEffect(() => {
    pushStateToMap();
  }, [payload]);

  return (
    <View style={[styles.container, { height }]}>
      <TypedWebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: BASE_LEAFLET_HTML }}
        onLoadEnd={pushStateToMap}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={styles.webview}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#E2E8F0',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
