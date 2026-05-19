import "@testing-library/jest-dom";
import { vi } from "vitest";

// Controllable mock channel returned by supabase.channel()
export const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
  unsubscribe: vi.fn(),
};

// Mock Supabase client
export const supabase = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn(),
};

// Helper to reset all mock state between tests
export function resetMocks() {
  mockChannel.on.mockReset().mockReturnThis();
  mockChannel.subscribe.mockReset().mockReturnThis();
  mockChannel.unsubscribe.mockReset();
  supabase.channel.mockReset().mockReturnValue(mockChannel);
  supabase.removeChannel.mockReset();
}

vi.mock("@/lib/supabase", () => ({
  supabase,
}));
