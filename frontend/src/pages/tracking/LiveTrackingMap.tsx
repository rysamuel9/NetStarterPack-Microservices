import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TrackingBreadcrumbItem, TrackingSummaryItem } from '../../types';

interface LiveTrackingMapProps {
  assignments: TrackingSummaryItem[];
  selectedId?: string | null;
  breadcrumbs?: TrackingBreadcrumbItem[];
  onSelectAssignment?: (id: string) => void;
  heightClass?: string;
  pickerMode?: boolean;
  pickerLat?: number;
  pickerLng?: number;
  pickerRadiusMeters?: number;
  onPickCoordinate?: (lat: number, lng: number) => void;
}

const JAKARTA_CENTER: [number, number] = [-6.198, 106.82];

function createBadgeIcon(label: string, bgColor: string, pulse = false): L.DivIcon {
  return L.divIcon({
    className: 'nsp-map-marker',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        ${
          pulse
            ? `<span style="position:absolute;width:34px;height:34px;border-radius:999px;background:${bgColor};opacity:0.28;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>`
            : ''
        }
        <div style="position:relative;min-width:26px;height:26px;padding:0 7px;border-radius:999px;background:${bgColor};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 3px 10px rgba(15,23,42,0.3);white-space:nowrap;">
          ${label}
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  assignments,
  selectedId,
  breadcrumbs = [],
  onSelectAssignment,
  heightClass = 'h-[420px]',
  pickerMode = false,
  pickerLat = -6.224495,
  pickerLng = 106.807755,
  pickerRadiusMeters = 150,
  onPickCoordinate,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: pickerMode ? [pickerLat, pickerLng] : JAKARTA_CENTER,
      zoom: pickerMode ? 15 : 13,
      zoomControl: true,
    });

    const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
      }
    );

    osmLayer.addTo(map);
    L.control.layers({ 'Peta Jalan (OSM)': osmLayer, 'Satelit': satelliteLayer }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      hasFittedRef.current = false;
    };
  }, [pickerMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickerMode || !onPickCoordinate) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      onPickCoordinate(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [pickerMode, onPickCoordinate]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (pickerMode) {
      L.circle([pickerLat, pickerLng], {
        radius: pickerRadiusMeters,
        color: '#0d9488',
        fillColor: '#14b8a6',
        fillOpacity: 0.16,
        dashArray: '6 4',
        weight: 2,
      }).addTo(group);

      L.marker([pickerLat, pickerLng], {
        icon: createBadgeIcon('TUJUAN', '#0d9488', true),
      }).addTo(group);

      map.panTo([pickerLat, pickerLng], { animate: true });
      return;
    }

    const boundsPoints: [number, number][] = [];
    const selectedAssignment = assignments.find((a) => a.id === selectedId) ?? null;

    if (selectedAssignment) {
      // Origin marker
      L.marker([selectedAssignment.originLatitude, selectedAssignment.originLongitude], {
        icon: createBadgeIcon('START', '#475569'),
      })
        .bindPopup(`<b>Titik Awal:</b> ${selectedAssignment.originLabel}`)
        .addTo(group);
      boundsPoints.push([selectedAssignment.originLatitude, selectedAssignment.originLongitude]);

      // Destination marker + Geofence circle
      L.circle([selectedAssignment.destinationLatitude, selectedAssignment.destinationLongitude], {
        radius: selectedAssignment.geofenceRadiusMeters,
        color: selectedAssignment.isInsideGeofence ? '#10b981' : '#0d9488',
        fillColor: selectedAssignment.isInsideGeofence ? '#10b981' : '#14b8a6',
        fillOpacity: 0.16,
        dashArray: '6 4',
        weight: 2,
      }).addTo(group);

      L.marker([selectedAssignment.destinationLatitude, selectedAssignment.destinationLongitude], {
        icon: createBadgeIcon('TUJUAN', '#e11d48'),
      })
        .bindPopup(
          `<b>${selectedAssignment.destinationLabel}</b><br/>${selectedAssignment.destinationAddress}<br/>Radius Geofence: ${selectedAssignment.geofenceRadiusMeters}m`
        )
        .addTo(group);
      boundsPoints.push([
        selectedAssignment.destinationLatitude,
        selectedAssignment.destinationLongitude,
      ]);

      // Breadcrumb route polyline
      const trailPoints: [number, number][] = breadcrumbs.map((b) => [b.latitude, b.longitude]);
      if (
        selectedAssignment.lastLatitude != null &&
        selectedAssignment.lastLongitude != null &&
        (trailPoints.length === 0 ||
          trailPoints[trailPoints.length - 1][0] !== selectedAssignment.lastLatitude ||
          trailPoints[trailPoints.length - 1][1] !== selectedAssignment.lastLongitude)
      ) {
        trailPoints.push([selectedAssignment.lastLatitude, selectedAssignment.lastLongitude]);
      }

      if (trailPoints.length >= 2) {
        L.polyline(trailPoints, {
          color: selectedAssignment.isSuspicious ? '#e11d48' : '#0d9488',
          weight: 4,
          opacity: 0.88,
        }).addTo(group);
      }

      // Dashed remaining line to destination
      if (selectedAssignment.lastLatitude != null && selectedAssignment.lastLongitude != null) {
        L.polyline(
          [
            [selectedAssignment.lastLatitude, selectedAssignment.lastLongitude],
            [selectedAssignment.destinationLatitude, selectedAssignment.destinationLongitude],
          ],
          {
            color: '#94a3b8',
            weight: 2,
            dashArray: '6 8',
            opacity: 0.8,
          }
        ).addTo(group);

        const isActive =
          selectedAssignment.status === 'InTransit' ||
          selectedAssignment.status === 'Arrived' ||
          selectedAssignment.status === 'IssueReported';
        const markerColor = selectedAssignment.isSuspicious
          ? '#e11d48'
          : selectedAssignment.status === 'IssueReported'
          ? '#f59e0b'
          : '#0284c7';

        L.marker([selectedAssignment.lastLatitude, selectedAssignment.lastLongitude], {
          icon: createBadgeIcon(selectedAssignment.assigneeUsername.toUpperCase(), markerColor, isActive),
        })
          .bindPopup(
            `<b>${selectedAssignment.assigneeFullName}</b><br/>${selectedAssignment.assignmentCode} • ${selectedAssignment.status}<br/>Jarak ke tujuan: ${Math.round(selectedAssignment.lastDistanceToDestinationMeters ?? 0)} m<br/>Kecepatan: ${(selectedAssignment.lastSpeedKmh ?? 0).toFixed(1)} km/j`
          )
          .addTo(group);
        boundsPoints.push([selectedAssignment.lastLatitude, selectedAssignment.lastLongitude]);
      }
    } else {
      // Overview mode: show all assignments on the command center map
      for (const item of assignments) {
        const lat = item.lastLatitude ?? item.destinationLatitude;
        const lng = item.lastLongitude ?? item.destinationLongitude;
        const isActive = item.status === 'InTransit' || item.status === 'IssueReported';
        const color = item.isSuspicious
          ? '#e11d48'
          : item.status === 'InTransit'
          ? '#0284c7'
          : item.status === 'PendingVerification'
          ? '#d97706'
          : item.status === 'Completed'
          ? '#10b981'
          : '#64748b';

        const marker = L.marker([lat, lng], {
          icon: createBadgeIcon(item.assignmentCode.replace('TRK-2026-', '#'), color, isActive),
        })
          .bindPopup(
            `<b>${item.assignmentCode} — ${item.title}</b><br/>Petugas: ${item.assigneeFullName}<br/>Status: ${item.status}`
          )
          .addTo(group);

        if (onSelectAssignment) {
          marker.on('click', () => onSelectAssignment(item.id));
        }

        boundsPoints.push([lat, lng]);
      }
    }

    if (boundsPoints.length > 0 && (!hasFittedRef.current || selectedAssignment)) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
      hasFittedRef.current = true;
    }
  }, [assignments, selectedId, breadcrumbs, pickerMode, pickerLat, pickerLng, pickerRadiusMeters, onSelectAssignment]);

  return (
    <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-slate-200 bg-slate-100`}>
      <div ref={containerRef} className="w-full h-full z-0" />
      {pickerMode && (
        <div className="absolute bottom-3 left-3 z-[400] px-3 py-1.5 rounded-xl bg-slate-900/85 text-white text-xs font-medium backdrop-blur-xs pointer-events-none">
          Klik di peta untuk menentukan titik tujuan ({pickerLat.toFixed(5)}, {pickerLng.toFixed(5)})
        </div>
      )}
    </div>
  );
};
