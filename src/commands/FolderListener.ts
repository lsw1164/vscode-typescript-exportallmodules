import * as vscode from "vscode";
import * as path from "path";
import { ExportAll } from ".";
import { EXTENSION_KEY, CONFIG_FOLDERS } from "../constants";
import { ExportFolder } from "../providers";
import { getRelativeFolderPath } from "../helpers";
import { Uri } from "vscode";
import { glob } from "glob";
import { promises as fs } from "fs";

export class FolderListener {
  private static watchers: { [path: string]: vscode.FileSystemWatcher } = {};

  /**
   * Add a new listener
   * @param uri
   */
  public static async add(uri: vscode.Uri) {
    const relativePath = getRelativeFolderPath(uri.fsPath);
    const options = [...new Set([...this.getFolders(), relativePath])];
    await this.updateFolders(options);
    this.startListener();
  }

  /**
   * Remove a listener
   * @param uri
   */
  public static async remove(exportFolder: ExportFolder) {
    if (exportFolder.value) {
      const relativePath = getRelativeFolderPath(exportFolder.value);
      let options = this.getFolders();
      options = options.filter((p) => p !== relativePath);
      options = [...new Set(options)];
      await this.updateFolders(options);
      this.startListener();
    }
  }

  /**
   * Start the listener
   */
  public static async startListener() {
    const folderListener: string[] =
      vscode.workspace.getConfiguration(EXTENSION_KEY).get(CONFIG_FOLDERS) ??
      [];

    // Dispose all the current watchers
    this.clearWatchers();

    // Recreate all the watchers
    if (folderListener.length === 0) {
      return;
    }

    const directories = await this.globDirectories(folderListener);

    for (const dir of directories) {
      const dirUri = vscode.Uri.file(dir);
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(dirUri, "*")
      );
      watcher.onDidDelete(this.listener);
      watcher.onDidCreate(this.listener);
      watcher.onDidChange(this.listener);
      this.watchers[dirUri.fsPath] = watcher;
    }
  }

  /**
   * Listener logic
   * @param uri
   */
  private static async listener(uri: vscode.Uri) {
    if (!this.isIndexFile(uri)) {
      const folderPath = Uri.file(path.dirname(uri.fsPath));
      await ExportAll.start(folderPath);
    }
  }

  /**
   * Get the current set folders
   */
  private static getFolders() {
    const config = vscode.workspace.getConfiguration(EXTENSION_KEY);
    const options: string[] = config.get(CONFIG_FOLDERS) ?? [];
    return options;
  }

  /**
   * Update the folder settings
   */
  private static async updateFolders(options: string[]) {
    let config = vscode.workspace.getConfiguration(EXTENSION_KEY);
    await config.update(CONFIG_FOLDERS, options);
  }

  /**
   * Check if the path ends with `index.ts`
   * @param uri
   */
  private static isIndexFile(uri: vscode.Uri) {
    return uri.fsPath.toLowerCase().endsWith("index.ts");
  }

  private static async globDirectories(
    folderListener: string[]
  ): Promise<string[]> {
    const globPathList = await glob(folderListener, {
      absolute: false,
      ignore: "**/node_modules/**",
      nodir: false,
    });

    const directories = (
      await Promise.all(
        globPathList.map(async (globPath) =>
          (await fs.lstat(globPath)).isDirectory() ? globPath : ""
        )
      )
    ).filter((dir) => dir);

    return directories;
  }

  private static clearWatchers() {
    for (const path of Object.keys(this.watchers)) {
      this.watchers[path]?.dispose();
    }
    this.watchers = {};
  }
}
