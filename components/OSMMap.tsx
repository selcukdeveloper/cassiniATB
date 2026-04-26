import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import * as Location from 'expo-location';
import React from 'react';

const KRISTIANSAND: Region = {
  latitude: 58.1467,
  longitude: 7.9956,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

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

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        mapType="standard"
        rotateEnabled
        showsUserLocation={showUserLocation}
        showsMyLocationButton={showUserLocation}
        onRegionChangeComplete={onRegionChange}
      >
        {children}
      </MapView>
    </View>
  );
}
