import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Region, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import React from 'react';

const KRISTIANSAND: Region = {
  latitude: 58.1467,
  longitude: 7.9956,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};
const HILLSHADE_TILE_URL = process.env.EXPO_PUBLIC_HILLSHADE_URL ?? null;

const HILLSHADE_MAX_Z = 13;

type Props = {
  initialRegion?: Region;
  onRegionChange?: (region: Region) => void;
  children?: React.ReactNode;
};

export default function OSMMap({
  initialRegion = KRISTIANSAND,
  onRegionChange,
  children,
}: Props) {
  const [showUserLocation, setShowUserLocation] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setShowUserLocation(status === 'granted');
    })();
  }, []);

  const mapType =
    Platform.OS === 'android' && HILLSHADE_TILE_URL ? 'none' : 'standard';

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        mapType={mapType}
        rotateEnabled
        showsUserLocation={showUserLocation}
        showsMyLocationButton={showUserLocation}
        onRegionChangeComplete={onRegionChange}
      >
        {HILLSHADE_TILE_URL && (
          <UrlTile
            urlTemplate={HILLSHADE_TILE_URL}
            maximumZ={HILLSHADE_MAX_Z}
            flipY={false}
          />
        )}
        {children}
      </MapView>
    </View>
  );
}
