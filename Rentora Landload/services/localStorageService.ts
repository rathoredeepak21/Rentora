import * as FileSystem from 'expo-file-system/legacy';

export const localStorageService = {
  async saveFile(sourceUri: string, folderName: string): Promise<string> {
    try {
      // Ensure target directory exists
      const dirUri = `${FileSystem.documentDirectory}${folderName}/`;
      const dirInfo = await FileSystem.getInfoAsync(dirUri);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
      }

      // Generate a unique filename
      const extension = sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `${Date.now()}.${extension}`;
      const destinationUri = `${dirUri}${fileName}`;

      // Copy file
      await FileSystem.copyAsync({
        from: sourceUri,
        to: destinationUri
      });

      return destinationUri;
    } catch (e) {
      console.error(`Local Storage Error: Failed to save file`, e);
      throw e;
    }
  },

  async deleteFile(fileUri: string): Promise<void> {
    if (!fileUri) return;
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(fileUri);
      }
    } catch (e) {
      console.warn(`Local Storage Error: Failed to delete file ${fileUri}`, e);
    }
  }
};

export default localStorageService;
