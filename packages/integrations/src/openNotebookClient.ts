import { getRuntimeConfig, type RuntimeConfig } from "./runtimeConfig";

export interface OpenNotebookNotebook {
  id: string;
  name: string;
  description?: string;
  archived?: boolean;
  created?: string;
  updated?: string;
  source_count?: number;
  note_count?: number;
}

export interface OpenNotebookSource {
  id: string;
  title: string;
  topics: string[];
  asset?: any;
  full_text?: string;
  embedded?: boolean;
  status?: string;
}

export class OpenNotebookClient {
  private readonly config: RuntimeConfig;

  public constructor(config: RuntimeConfig = getRuntimeConfig()) {
    this.config = config;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    if (this.config.openNotebookPassword) {
      headers["Authorization"] = `Bearer ${this.config.openNotebookPassword}`;
    }

    return headers;
  }

  /**
   * List all notebooks.
   */
  public async listNotebooks(): Promise<OpenNotebookNotebook[]> {
    const url = `${this.config.openNotebookApiUrl}/api/notebooks`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to list notebooks: status ${response.status}`);
      }

      return (await response.json()) as OpenNotebookNotebook[];
    } catch (err) {
      console.error("Open Notebook listNotebooks error:", err);
      throw err;
    }
  }

  /**
   * Create a new notebook.
   */
  public async createNotebook(name: string, description?: string): Promise<OpenNotebookNotebook> {
    const url = `${this.config.openNotebookApiUrl}/api/notebooks`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ name, description: description ?? "" })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create notebook: status ${response.status}. Details: ${errorText}`);
      }

      return (await response.json()) as OpenNotebookNotebook;
    } catch (err) {
      console.error("Open Notebook createNotebook error:", err);
      throw err;
    }
  }

  /**
   * Helper to get a notebook by name, or create it if it doesn't exist.
   */
  public async getOrCreateNotebook(name: string, description?: string): Promise<string> {
    try {
      const notebooks = await this.listNotebooks();
      const existing = notebooks.find(n => n.name === name);
      if (existing) {
        return existing.id;
      }
      
      const created = await this.createNotebook(name, description);
      return created.id;
    } catch (err) {
      console.warn(`Error in getOrCreateNotebook for name "${name}", trying to create directly:`, err);
      try {
        const created = await this.createNotebook(name, description);
        return created.id;
      } catch (createErr) {
        console.error("Fatal error creating notebook directly:", createErr);
        throw createErr;
      }
    }
  }

  /**
   * Create a new document (source) inside one or more notebooks.
   */
  public async createSource(
    notebooks: string[],
    title: string,
    content: string,
    embed = true,
    asyncProcessing = true
  ): Promise<OpenNotebookSource> {
    const url = `${this.config.openNotebookApiUrl}/api/sources/json`;
    const payload = {
      notebooks,
      type: "text",
      title,
      content,
      embed,
      async_processing: asyncProcessing
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create source: status ${response.status}. Details: ${errorText}`);
      }

      return (await response.json()) as OpenNotebookSource;
    } catch (err) {
      console.error("Open Notebook createSource error:", err);
      throw err;
    }
  }

  /**
   * Create a note inside a notebook.
   */
  public async createNote(
    notebookId: string,
    title: string,
    content: string,
    noteType = "ai"
  ): Promise<any> {
    const url = `${this.config.openNotebookApiUrl}/api/notes`;
    const payload = {
      notebook_id: notebookId,
      title,
      content,
      note_type: noteType
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create note: status ${response.status}. Details: ${errorText}`);
      }

      return await response.json();
    } catch (err) {
      console.error("Open Notebook createNote error:", err);
      throw err;
    }
  }
}
