import { authorizedClient } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { z } from "zod";


/* ============================================================
 * TYPES
 * ============================================================ */

export type FolderModule = "documents";


export type Folder = {
  id: string;
  name: string;
  parent_id: string | null;
  module: FolderModule;
  legal_entity_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};


export type FolderBreadcrumbItem = {
  id: string;
  name: string;
};


export type FolderContents = {
  folder: Folder | null;
  folders: Folder[];
  breadcrumb: FolderBreadcrumbItem[];
};


export type FolderUsage = {
  folders: number;
  documents: number;
  total: number;
  empty: boolean;
};


export type FolderUsageMap =
  Record<string, FolderUsage>;


/*
 * Rappresentazione piatta dell'albero.
 *
 * depth:
 * 0 = cartella root
 * 1 = figlia di una cartella root
 * 2 = livello successivo
 * ecc.
 *
 * path contiene il percorso leggibile completo.
 */
export type FolderTreeItem = Folder & {
  depth: number;
  path: string;
};


/* ============================================================
 * VALIDATION
 * ============================================================ */

const uuidSchema = z.uuid();


const folderModuleSchema = z.enum([
  "documents",
]);


const folderNameSchema = z
  .string()
  .trim()
  .min(
    1,
    "Il nome della cartella è obbligatorio.",
  )
  .max(
    255,
    "Il nome della cartella è troppo lungo.",
  );


const optionalUuidSchema = z
  .uuid()
  .nullable()
  .optional();


/* ============================================================
 * GET FOLDERS
 * ============================================================ */

/**
 * Restituisce le sottocartelle dirette di una cartella.
 *
 * parentId = null -> root del modulo.
 *
 * Le cartelle archiviate non vengono restituite.
 */
export async function getFolders(
  module: FolderModule = "documents",
  parentId: string | null = null,
): Promise<Folder[]> {
  const parsedModule =
    folderModuleSchema.parse(module);


  if (parentId !== null) {
    uuidSchema.parse(parentId);
  }


  const db = await authorizedClient(
    "document.read",
  );


  let query = db
    .from("folders")
    .select("*")
    .eq(
      "module",
      parsedModule,
    )
    .is(
      "archived_at",
      null,
    );


  if (parentId === null) {
    query = query.is(
      "parent_id",
      null,
    );
  } else {
    query = query.eq(
      "parent_id",
      parentId,
    );
  }


  const result = await query
    .order(
      "name",
      {
        ascending: true,
      },
    )
    .order(
      "id",
      {
        ascending: true,
      },
    );


  checkDatabase(
    result.error,
    "Lettura cartelle",
  );


  return (
    result.data ?? []
  ) as Folder[];
}


/* ============================================================
 * GET SINGLE FOLDER
 * ============================================================ */

export async function getFolder(
  id: string,
): Promise<Folder | null> {
  const folderId =
    uuidSchema.parse(id);


  const db = await authorizedClient(
    "document.read",
  );


  const result = await db
    .from("folders")
    .select("*")
    .eq(
      "id",
      folderId,
    )
    .is(
      "archived_at",
      null,
    )
    .maybeSingle();


  checkDatabase(
    result.error,
    "Lettura cartella",
  );


  return result.data as Folder | null;
}


/* ============================================================
 * GET FOLDER CHILDREN
 * ============================================================ */

export async function getFolderChildren(
  parentId: string,
  module: FolderModule = "documents",
): Promise<Folder[]> {
  return getFolders(
    module,
    uuidSchema.parse(parentId),
  );
}


/* ============================================================
 * GET BREADCRUMB
 * ============================================================ */

export async function getFolderBreadcrumb(
  folderId: string | null,
  module: FolderModule = "documents",
): Promise<FolderBreadcrumbItem[]> {
  if (folderId === null) {
    return [];
  }


  const parsedModule =
    folderModuleSchema.parse(module);

  const parsedFolderId =
    uuidSchema.parse(folderId);


  const db = await authorizedClient(
    "document.read",
  );


  const breadcrumb:
    FolderBreadcrumbItem[] = [];

  const visited =
    new Set<string>();


  let currentId:
    string | null =
    parsedFolderId;


  let depth = 0;

  const maxDepth = 100;


  type BreadcrumbFolderRow = {
    id: string;
    name: string;
    parent_id: string | null;
    module: string;
  };


  while (currentId !== null) {
    if (
      visited.has(currentId)
    ) {
      throw new Error(
        "Rilevato un ciclo anomalo nell'alberatura delle cartelle.",
      );
    }


    if (
      depth >= maxDepth
    ) {
      throw new Error(
        "Profondità massima dell'alberatura superata.",
      );
    }


    visited.add(
      currentId,
    );


    const queryResult = await db
      .from("folders")
      .select(
        "id,name,parent_id,module",
      )
      .eq(
        "id",
        currentId,
      )
      .eq(
        "module",
        parsedModule,
      )
      .is(
        "archived_at",
        null,
      )
      .maybeSingle();


    checkDatabase(
      queryResult.error,
      "Lettura percorso cartella",
    );


    const row =
      queryResult.data as
        BreadcrumbFolderRow | null;


    if (!row) {
      throw new Error(
        "Una cartella del percorso non è stata trovata.",
      );
    }


    breadcrumb.unshift({
      id: row.id,
      name: row.name,
    });


    currentId =
      row.parent_id;


    depth += 1;
  }


  return breadcrumb;
}


/* ============================================================
 * GET FOLDER CONTENTS
 * ============================================================ */

export async function getFolderContents(
  folderId: string | null,
  module: FolderModule = "documents",
): Promise<FolderContents> {
  const parsedModule =
    folderModuleSchema.parse(module);


  if (folderId === null) {
    const folders =
      await getFolders(
        parsedModule,
        null,
      );


    return {
      folder: null,
      folders,
      breadcrumb: [],
    };
  }


  const parsedFolderId =
    uuidSchema.parse(folderId);


  const [
    folder,
    folders,
    breadcrumb,
  ] = await Promise.all([
    getFolder(
      parsedFolderId,
    ),

    getFolders(
      parsedModule,
      parsedFolderId,
    ),

    getFolderBreadcrumb(
      parsedFolderId,
      parsedModule,
    ),
  ]);


  if (!folder) {
    throw new Error(
      "Cartella non trovata.",
    );
  }


  if (
    folder.module !==
    parsedModule
  ) {
    throw new Error(
      "La cartella appartiene a un modulo differente.",
    );
  }


  return {
    folder,
    folders,
    breadcrumb,
  };
}


/* ============================================================
 * GET COMPLETE FOLDER TREE
 * ============================================================
 *
 * Recupera tutte le cartelle attive del modulo con UNA query
 * e costruisce in memoria l'albero ordinato.
 *
 * Il risultato è volutamente piatto:
 *
 * Amministrazione          depth 0
 *   Contabilità            depth 1
 *     2026                 depth 2
 * Commesse                 depth 0
 *   Francia                depth 1
 *
 * Questo formato è comodo per select, menu e modali.
 * ============================================================ */

export async function getFolderTree(
  module: FolderModule = "documents",
): Promise<FolderTreeItem[]> {
  const parsedModule =
    folderModuleSchema.parse(module);


  const db = await authorizedClient(
    "document.read",
  );


  const result = await db
    .from("folders")
    .select("*")
    .eq(
      "module",
      parsedModule,
    )
    .is(
      "archived_at",
      null,
    )
    .order(
      "name",
      {
        ascending: true,
      },
    )
    .order(
      "id",
      {
        ascending: true,
      },
    );


  checkDatabase(
    result.error,
    "Lettura alberatura cartelle",
  );


  const folders =
    (result.data ?? []) as Folder[];


  const children =
    new Map<
      string | null,
      Folder[]
    >();


  for (
    const folder of folders
  ) {
    const parentId =
      folder.parent_id;


    const existing =
      children.get(parentId) ?? [];


    existing.push(
      folder,
    );


    children.set(
      parentId,
      existing,
    );
  }


  /*
   * La query è già ordinata per nome, ma manteniamo
   * esplicitamente l'ordinamento dei gruppi.
   */
  for (
    const group of children.values()
  ) {
    group.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "it",
          {
            sensitivity: "base",
          },
        ),
    );
  }


  const tree:
    FolderTreeItem[] = [];


  const visited =
    new Set<string>();


  const walk = (
    parentId: string | null,
    depth: number,
    parentPath: string,
  ) => {
    const group =
      children.get(parentId) ?? [];


    for (
      const folder of group
    ) {
      /*
       * Protezione aggiuntiva lato applicazione.
       * Il DB impedisce già i cicli.
       */
      if (
        visited.has(folder.id)
      ) {
        continue;
      }


      visited.add(
        folder.id,
      );


      const path =
        parentPath
          ? `${parentPath} > ${folder.name}`
          : folder.name;


      tree.push({
        ...folder,
        depth,
        path,
      });


      walk(
        folder.id,
        depth + 1,
        path,
      );
    }
  };


  walk(
    null,
    0,
    "",
  );


  return tree;
}


/* ============================================================
 * CREATE FOLDER
 * ============================================================ */

export async function createFolder(
  input: {
    name: string;
    module?: FolderModule;
    parentId?: string | null;
    legalEntityId?: string | null;
  },
): Promise<string> {
  const name =
    folderNameSchema.parse(
      input.name,
    );


  const module =
    folderModuleSchema.parse(
      input.module ??
        "documents",
    );


  const parentId =
    optionalUuidSchema.parse(
      input.parentId ??
        null,
    );


  const legalEntityId =
    optionalUuidSchema.parse(
      input.legalEntityId ??
        null,
    );


  const db = await authorizedClient(
    "document.upload",
  );


  const result =
    await db.rpc(
      "folder_create",
      {
        p_name: name,
        p_module: module,
        p_parent_id:
          parentId,
        p_legal_entity_id:
          legalEntityId,
      },
    );


  checkDatabase(
    result.error,
    "Creazione cartella",
  );


  if (!result.data) {
    throw new Error(
      "La cartella è stata creata ma non è stato restituito il relativo ID.",
    );
  }


  return String(
    result.data,
  );
}


/* ============================================================
 * RENAME FOLDER
 * ============================================================ */

export async function renameFolder(
  folderId: string,
  name: string,
): Promise<void> {
  const id =
    uuidSchema.parse(
      folderId,
    );


  const parsedName =
    folderNameSchema.parse(
      name,
    );


  const db = await authorizedClient(
    "document.update",
  );


  const result =
    await db.rpc(
      "folder_rename",
      {
        p_folder_id:
          id,

        p_name:
          parsedName,
      },
    );


  checkDatabase(
    result.error,
    "Rinomina cartella",
  );
}


/* ============================================================
 * MOVE FOLDER
 * ============================================================ */

export async function moveFolder(
  folderId: string,
  parentId: string | null,
): Promise<void> {
  const id =
    uuidSchema.parse(
      folderId,
    );


  const parsedParentId =
    optionalUuidSchema.parse(
      parentId,
    );


  const db = await authorizedClient(
    "document.update",
  );


  const result =
    await db.rpc(
      "folder_move",
      {
        p_folder_id:
          id,

        p_parent_id:
          parsedParentId,
      },
    );


  checkDatabase(
    result.error,
    "Spostamento cartella",
  );
}


/* ============================================================
 * ARCHIVE FOLDER
 * ============================================================ */

export async function archiveFolder(
  folderId: string,
): Promise<void> {
  const id =
    uuidSchema.parse(
      folderId,
    );


  const db = await authorizedClient(
    "document.update",
  );


  const result =
    await db.rpc(
      "folder_archive",
      {
        p_folder_id:
          id,
      },
    );


  checkDatabase(
    result.error,
    "Eliminazione cartella",
  );
}


/* ============================================================
 * RESTORE FOLDER
 * ============================================================ */

export async function restoreFolder(
  folderId: string,
): Promise<void> {
  const id =
    uuidSchema.parse(
      folderId,
    );


  const db = await authorizedClient(
    "document.update",
  );


  const result =
    await db.rpc(
      "folder_restore",
      {
        p_folder_id:
          id,
      },
    );


  checkDatabase(
    result.error,
    "Ripristino cartella",
  );
}


/* ============================================================
 * GET ARCHIVED FOLDERS
 * ============================================================ */

export async function getArchivedFolders(
  module: FolderModule = "documents",
): Promise<Folder[]> {
  const parsedModule =
    folderModuleSchema.parse(
      module,
    );


  const db = await authorizedClient(
    "document.read",
  );


  const result =
    await db
      .from("folders")
      .select("*")
      .eq(
        "module",
        parsedModule,
      )
      .not(
        "archived_at",
        "is",
        null,
      )
      .order(
        "archived_at",
        {
          ascending: false,
        },
      );


  checkDatabase(
    result.error,
    "Lettura cartelle archiviate",
  );


  return (
    result.data ?? []
  ) as Folder[];
}


/* ============================================================
 * GET FOLDER USAGE
 * ============================================================ */

export async function getFolderUsage(
  folderId: string,
): Promise<FolderUsage> {
  const id =
    uuidSchema.parse(
      folderId,
    );


  const db = await authorizedClient(
    "document.read",
  );


  const [
    foldersResult,
    documentsResult,
  ] = await Promise.all([
    db
      .from("folders")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      )
      .eq(
        "parent_id",
        id,
      )
      .is(
        "archived_at",
        null,
      ),

    db
      .from("documents")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      )
      .eq(
        "folder_id",
        id,
      )
      .is(
        "archived_at",
        null,
      ),
  ]);


  checkDatabase(
    foldersResult.error,
    "Conteggio sottocartelle",
  );


  checkDatabase(
    documentsResult.error,
    "Conteggio documenti cartella",
  );


  const folders =
    foldersResult.count ?? 0;


  const documents =
    documentsResult.count ?? 0;


  const total =
    folders +
    documents;


  return {
    folders,
    documents,
    total,
    empty:
      total === 0,
  };
}


/* ============================================================
 * GET FOLDER USAGE MAP
 * ============================================================ */

export async function getFolderUsageMap(
  folderIds: string[],
): Promise<FolderUsageMap> {
  if (
    folderIds.length === 0
  ) {
    return {};
  }


  const ids = [
    ...new Set(
      folderIds.map(
        (id) =>
          uuidSchema.parse(id),
      ),
    ),
  ];


  const db = await authorizedClient(
    "document.read",
  );


  const [
    childFoldersResult,
    documentsResult,
  ] = await Promise.all([
    db
      .from("folders")
      .select(
        "id,parent_id",
      )
      .in(
        "parent_id",
        ids,
      )
      .eq(
        "module",
        "documents",
      )
      .is(
        "archived_at",
        null,
      ),

    db
      .from("documents")
      .select(
        "id,folder_id",
      )
      .in(
        "folder_id",
        ids,
      )
      .is(
        "archived_at",
        null,
      ),
  ]);


  checkDatabase(
    childFoldersResult.error,
    "Conteggio sottocartelle",
  );


  checkDatabase(
    documentsResult.error,
    "Conteggio documenti nelle cartelle",
  );


  const usage:
    FolderUsageMap =
    Object.fromEntries(
      ids.map(
        (id) => [
          id,
          {
            folders: 0,
            documents: 0,
            total: 0,
            empty: true,
          },
        ],
      ),
    );


  for (
    const row of
      childFoldersResult.data ??
      []
  ) {
    const parentId =
      row.parent_id
        ? String(
            row.parent_id,
          )
        : null;


    if (
      parentId &&
      usage[parentId]
    ) {
      usage[
        parentId
      ].folders += 1;
    }
  }


  for (
    const row of
      documentsResult.data ??
      []
  ) {
    const folderId =
      row.folder_id
        ? String(
            row.folder_id,
          )
        : null;


    if (
      folderId &&
      usage[folderId]
    ) {
      usage[
        folderId
      ].documents += 1;
    }
  }


  for (
    const id of ids
  ) {
    const item =
      usage[id];


    item.total =
      item.folders +
      item.documents;


    item.empty =
      item.total === 0;
  }


  return usage;
}