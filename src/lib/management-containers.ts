import "server-only";
import { z } from "zod";
import { authorizedClient } from "@/lib/permissions";
import { AppError, checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { managementContainerSchema, managementContainerMovementSchema, managementContainerAssetSchema,
  managementContainerAssetRemovalSchema, uuidSchema } from "@/lib/validations";
import type { AssetProject, ManagementAsset } from "@/lib/management-assets";

export type ManagementContainer = Omit<z.output<typeof managementContainerSchema>, "description" | "notes"> & {
  id: string; description: string | null; notes: string | null;
  current_project_id: string | null; current_project_code: string | null; current_project_name: string | null; asset_count: number;
};
export type ContainerMovement = {
  id: string; container_id: string; from_project_id: string | null; to_project_id: string | null;
  from_project: AssetProject | null; to_project: AssetProject | null;
  movement_date: string; transport_cost: number | null; currency: string; notes: string | null;
};
export type ContainerAsset = {
  id: string; container_id: string; asset_id: string; date_in: string; date_out: string | null; notes: string | null;
  asset: Pick<ManagementAsset, "id" | "asset_code" | "name" | "category" | "status" | "allocation_method" | "hourly_rate" | "daily_rate" | "monthly_rate" | "currency"> | null;
};
export type ContainerAssetOption = { id: string; asset_code: string; name: string };
function relation<T>(value: T | T[] | null): T | null { return (Array.isArray(value) ? value[0] : value) ?? null; }
function checkContainerMutation(error: { code?: string; message: string } | null) {
  if (error?.code === "22023" && ["Container non trovato.", "Container non trovato o dismesso.", "Attrezzatura non trovata o dismessa.",
    "Attrezzatura già contenuta in un container.", "Relazione container non trovata o già chiusa.", "La data di uscita deve seguire l’ingresso.",
    "Dati ingresso non validi.", "Dati movimento container non validi.", "Commessa non disponibile."].includes(error.message)) {
    throw new AppError("validation", error.message);
  }
  checkDatabase(error, "Aggiornamento container");
}
export async function getManagementContainers(): Promise<ManagementContainer[]> {
  const db = await authorizedClient("management.read");
  return await readAll((from, to) => db.from("management_container_summaries").select("*").order("container_code").order("id").range(from, to)) as ManagementContainer[];
}
export async function getManagementContainerById(id: string): Promise<ManagementContainer | null> {
  const db = await authorizedClient("management.read");
  const result = await db.from("management_container_summaries").select("*").eq("id", uuidSchema.parse(id)).maybeSingle();
  checkDatabase(result.error, "Lettura container");
  return result.data as ManagementContainer | null;
}
export async function createManagementContainer(input: z.input<typeof managementContainerSchema>) {
  const db = await authorizedClient("management.update");
  const result = await db.from("management_containers").insert(managementContainerSchema.parse(input)).select("id").single();
  checkContainerMutation(result.error);
  return String(result.data!.id);
}
export async function updateManagementContainer(id: string, input: z.input<typeof managementContainerSchema>) {
  const db = await authorizedClient("management.update");
  const result = await db.from("management_containers").update(managementContainerSchema.parse(input)).eq("id", uuidSchema.parse(id)).select("id").maybeSingle();
  checkContainerMutation(result.error);
  if (!result.data) throw new AppError("conflict", "Container non trovato.");
  return String(result.data.id);
}
export async function moveManagementContainer(input: z.input<typeof managementContainerMovementSchema>) {
  const db = await authorizedClient("management.update");
  const value = managementContainerMovementSchema.parse(input);
  const result = await db.rpc("move_management_container", { p_container_id: value.container_id, p_to_project_id: value.to_project_id,
    p_movement_date: value.movement_date, p_transport_cost: value.transport_cost, p_currency: value.currency, p_notes: value.notes });
  checkContainerMutation(result.error);
  return String(result.data);
}
export async function getManagementContainerMovements(containerId: string): Promise<ContainerMovement[]> {
  const db = await authorizedClient("management.read");
  const id = uuidSchema.parse(containerId);
  const rows = await readAll((from, to) => db.from("management_container_movements")
    .select("*,from_project:projects!management_container_movements_from_project_id_fkey(id,project_code,name),to_project:projects!management_container_movements_to_project_id_fkey(id,project_code,name)")
    .eq("container_id", id).order("movement_date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(from, to));
  return rows.map(row => ({ ...row, from_project: relation(row.from_project), to_project: relation(row.to_project) })) as ContainerMovement[];
}
export async function getManagementContainerAssets(containerId: string): Promise<ContainerAsset[]> {
  const db = await authorizedClient("management.read");
  const id = uuidSchema.parse(containerId);
  const rows = await readAll((from, to) => db.from("management_container_assets")
    .select("*,asset:management_assets(id,asset_code,name,category,status,allocation_method,hourly_rate,daily_rate,monthly_rate,currency)")
    .eq("container_id", id).order("date_in", { ascending: false }).order("id").range(from, to));
  return rows.map(row => ({ ...row, asset: relation(row.asset) })) as ContainerAsset[];
}
export async function addAssetToContainer(input: z.input<typeof managementContainerAssetSchema>) {
  const db = await authorizedClient("management.update");
  const value = managementContainerAssetSchema.parse(input);
  const result = await db.rpc("add_asset_to_container", { p_container_id: value.container_id, p_asset_id: value.asset_id, p_date_in: value.date_in, p_notes: value.notes });
  checkContainerMutation(result.error);
  return String(result.data);
}
export async function removeAssetFromContainer(input: z.input<typeof managementContainerAssetRemovalSchema>) {
  const db = await authorizedClient("management.update");
  const value = managementContainerAssetRemovalSchema.parse(input);
  const result = await db.rpc("remove_asset_from_container", { p_id: value.id, p_date_out: value.date_out });
  checkContainerMutation(result.error);
  return String(result.data);
}
export async function getAvailableContainerAssets(): Promise<ContainerAssetOption[]> {
  const db = await authorizedClient("management.update");
  return await readAll((from, to) => db.from("management_available_container_assets").select("*").order("asset_code").order("id").range(from, to)) as ContainerAssetOption[];
}
export async function getAssetCurrentContainer(assetId: string) {
  const db = await authorizedClient("management.read");
  const result = await db.from("management_container_assets").select("container:management_containers(id,container_code,name)")
    .eq("asset_id", uuidSchema.parse(assetId)).is("date_out", null).maybeSingle();
  checkDatabase(result.error, "Container attuale attrezzatura");
  return relation(result.data?.container ?? null) as { id: string; container_code: string; name: string } | null;
}
