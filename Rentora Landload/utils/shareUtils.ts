import * as Sharing from 'expo-sharing';
import { Share, Platform } from 'react-native';

export const shareUtils = {
  async shareFile(fileUri: string, mimeType: string = 'application/pdf'): Promise<boolean> {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        return false;
      }
      
      await Sharing.shareAsync(fileUri, {
        mimeType,
        dialogTitle: 'Share Invoice PDF',
        UTI: 'com.adobe.pdf',
      });
      return true;
    } catch (e) {
      console.error('Sharing error', e);
      return false;
    }
  },

  async shareText(message: string, title?: string): Promise<boolean> {
    try {
      await Share.share({
        message,
        title: title || 'Rent Invoice Details',
      });
      return true;
    } catch (e) {
      console.error('Text sharing error', e);
      return false;
    }
  }
};
export default shareUtils;
