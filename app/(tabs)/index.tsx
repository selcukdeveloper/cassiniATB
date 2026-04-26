import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { type Region } from 'react-native-maps';
import ClaimSheet from '../../components/ClaimSheet';
import Header from '../../components/Header';
import LakesLayer, {
  type LakeFeature,
  type LakesLoadState,
} from '../../components/LakesLayer';
import OSMMap from '../../components/OSMMap';
import RatingModal from '../../components/RatingModal';
import { useSession } from '../../lib/auth';
import { indexClaims, useActiveClaims } from '../../lib/claims';
import { lakeLabel } from '../../lib/lake-display';
import { rateLake, useLakeRating } from '../../lib/lake-ratings';

export default function MapTab() {
  const { session } = useSession();
  const myUserId = session?.user.id ?? null;
  const { claims, loading: claimsLoading } = useActiveClaims();
  const claimsByLakeId = useMemo(() => indexClaims(claims), [claims]);

  const [selectedLake, setSelectedLake] = useState<LakeFeature | null>(null);
  const [ratingLake, setRatingLake] = useState<LakeFeature | null>(null);
  const [region, setRegion] = useState<Region | undefined>(undefined);
  const [lakesLoadState, setLakesLoadState] =
    useState<LakesLoadState>('loading');

  // For the rating modal: fetch initial value (so the user sees their previous rating).
  const { myStars, refresh: refreshRating } = useLakeRating(
    ratingLake?.properties.LAKID ?? null,
    myUserId,
  );

  const selectedClaim = selectedLake
    ? (claimsByLakeId[selectedLake.properties.LAKID] ?? null)
    : null;

  return (
    <View style={styles.root}>
      <OSMMap onRegionChange={setRegion}>
        <LakesLayer
          claimsByLakeId={claimsByLakeId}
          onSelect={setSelectedLake}
          region={region}
          onLoadStateChange={setLakesLoadState}
        />
      </OSMMap>
      <View style={styles.headerOverlay}>
        <Header
          onFindWater={() => console.log('find water')}
          onTestWater={() => console.log('test water')}
        />
      </View>

      {(lakesLoadState === 'loading' ||
        lakesLoadState === 'error' ||
        claimsLoading) && (
        <View style={styles.statusPill}>
          {(lakesLoadState === 'loading' || claimsLoading) && (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.statusText}>
                {lakesLoadState === 'loading'
                  ? 'Loading lakes…'
                  : 'Loading claims…'}
              </Text>
            </>
          )}
          {lakesLoadState === 'error' && (
            <Text style={styles.statusText}>Couldn&apos;t load lakes.</Text>
          )}
        </View>
      )}

      <ClaimSheet
        lake={selectedLake}
        claim={selectedClaim}
        myUserId={myUserId}
        onClose={() => setSelectedLake(null)}
        onRequestRate={(lake) => {
          // Close the claim sheet, open the rating modal for that lake.
          setSelectedLake(null);
          setRatingLake(lake);
        }}
      />

      <RatingModal
        visible={ratingLake !== null}
        lakeLabel={
          ratingLake ? lakeLabel(ratingLake.properties.LAKID) : null
        }
        initialStars={myStars}
        onClose={() => setRatingLake(null)}
        onSubmit={async (stars) => {
          if (!ratingLake) return;
          await rateLake(ratingLake.properties.LAKID, stars);
          await refreshRating();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  statusPill: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(22, 33, 62, 0.9)',
  },
  statusText: { color: '#fff', fontSize: 14, fontWeight: '500' },
});
