import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

// Pick an image from the camera roll (or take a fresh photo) and upload it to
// Supabase Storage, then insert a `claim_samples` row tying it to a claim.
//
// Returns the inserted sample row, or null if the user cancelled the picker.
// We don't accept a lake name — LAKID is the canonical identifier; the schema
// has no lake_name column.
export async function uploadSampleForClaim(opts: {
  userId: string;
  lakeId: string;
  notes?: string;
  source?: 'library' | 'camera';
}) {
  const { userId, lakeId, notes = null, source = 'library' } = opts;

  // 1. Permission + pick
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission denied');
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Photo library permission denied');
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          quality: 0.6,
          base64: true,
          exif: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], // SDK 54 — replaces deprecated MediaTypeOptions.Images
          quality: 0.6,
          base64: true,
          exif: false,
        });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  // 2. Upload to Storage. Path: <user_id>/<lake_id>/<timestamp>.jpg.
  const fileName = `${Date.now()}.jpg`;
  const objectPath = `${userId}/${lakeId}/${fileName}`;
  if (!asset.base64) throw new Error('No image data');
  const arrayBuffer = decodeBase64(asset.base64);
  const { error: uploadErr } = await supabase.storage
    .from('samples')
    .upload(objectPath, arrayBuffer, {
      contentType: asset.mimeType ?? 'image/jpeg',
      upsert: false,
    });
  if (uploadErr) throw uploadErr;

  const { data: pub } = supabase.storage.from('samples').getPublicUrl(objectPath);

  // 3. Insert claim_samples row.
  const { data: row, error: insertErr } = await supabase
    .from('claim_samples')
    .insert({
      lake_id: lakeId,
      user_id: userId,
      photo_url: pub.publicUrl,
      status: 'pending',
      notes,
    })
    .select()
    .single();
  if (insertErr) throw insertErr;
  return row;
}

// Decode a base64 string to a Uint8Array. RN doesn't ship atob/Buffer in an
// API stable across versions, so we hand-roll a fast decoder.
function decodeBase64(b64: string): Uint8Array {
  const lookup = new Uint8Array(256);
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const cleaned = b64.replace(/=+$/, '');
  const len = cleaned.length;
  const outLen = (len * 3) >> 2;
  const out = new Uint8Array(outLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[cleaned.charCodeAt(i)];
    const b = lookup[cleaned.charCodeAt(i + 1)];
    const c = lookup[cleaned.charCodeAt(i + 2)];
    const d = lookup[cleaned.charCodeAt(i + 3)];
    out[p++] = (a << 2) | (b >> 4);
    if (i + 2 < len) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < len) out[p++] = ((c & 3) << 6) | d;
  }
  return out;
}
