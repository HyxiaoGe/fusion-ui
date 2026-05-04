import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as api from '@/lib/api/credentials';
import type { UserCredentialInfo } from '@/lib/api/credentials';

interface CredentialsState {
  items: UserCredentialInfo[];
  loading: boolean;
  error: string | null;
}

const initialState: CredentialsState = {
  items: [],
  loading: false,
  error: null,
};

export const fetchCredentials = createAsyncThunk('credentials/fetch', async () => {
  const res = await api.listCredentials();
  return res.credentials;
});

export const upsertCredential = createAsyncThunk(
  'credentials/upsert',
  async (payload: { providerId: string; apiKey: string }) => {
    return api.upsertCredential(payload.providerId, payload.apiKey);
  },
);

export const deleteCredentialThunk = createAsyncThunk(
  'credentials/delete',
  async (providerId: string) => {
    await api.deleteCredential(providerId);
    return providerId;
  },
);

const credentialsSlice = createSlice({
  name: 'credentials',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCredentials.pending, (s) => {
        s.loading = true;
        s.error = null;
      })
      .addCase(fetchCredentials.fulfilled, (s, a) => {
        s.items = a.payload;
        s.loading = false;
      })
      .addCase(fetchCredentials.rejected, (s, a) => {
        s.loading = false;
        s.error = a.error.message ?? '加载失败';
      })
      .addCase(upsertCredential.fulfilled, (s, a) => {
        const idx = s.items.findIndex((c) => c.provider_id === a.payload.provider_id);
        if (idx >= 0) s.items[idx] = a.payload;
        else s.items.push(a.payload);
      })
      .addCase(deleteCredentialThunk.fulfilled, (s, a) => {
        s.items = s.items.filter((c) => c.provider_id !== a.payload);
      });
  },
});

export default credentialsSlice.reducer;
