/**
 * Simple Pipedrive API utility for direct API calls.
 * Handles authentication, error handling, and common operations.
 */

import { ENV } from "./_core/env";

const PIPEDRIVE_BASE_URL = "https://api.pipedrive.com/v1";
const API_KEY = ENV.pipedriveApiKey;

export interface PipedriveResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  additional_data?: Record<string, unknown>;
}

/**
 * Make a GET request to the Pipedrive API.
 */
export async function pipedriveGet<T = unknown>(
  endpoint: string,
  params?: Record<string, string | number | boolean>
): Promise<T | null> {
  try {
    const url = new URL(`${PIPEDRIVE_BASE_URL}/${endpoint}`);
    url.searchParams.set("api_token", API_KEY);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`Pipedrive API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as PipedriveResponse<T>;
    if (!data.success) {
      console.error(`Pipedrive API error: ${data.error}`);
      return null;
    }

    return data.data ?? null;
  } catch (err) {
    console.error("Pipedrive API request failed:", err);
    return null;
  }
}

/**
 * Get all won deals for a specific person (AE).
 */
export async function getPersonWonDeals(personId: number, limit = 500) {
  return pipedriveGet<
    Array<{
      id: number;
      title: string;
      value: number;
      currency: string;
      won_time: string;
      add_time: string;
    }>
  >(`persons/${personId}/deals`, {
    status: "won",
    limit,
  });
}

/**
 * Get a person's details by ID.
 */
export async function getPerson(personId: number) {
  return pipedriveGet<{
    id: number;
    name: string;
    email: string;
  }>(`persons/${personId}`);
}

/**
 * Get all deals with optional filtering.
 */
export async function getAllDeals(params?: Record<string, string | number | boolean>) {
  return pipedriveGet<
    Array<{
      id: number;
      title: string;
      value: number;
      currency: string;
      won_time: string;
      person_id: number;
    }>
  >("deals", params);
}
