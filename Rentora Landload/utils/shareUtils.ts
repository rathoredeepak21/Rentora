import * as Sharing from 'expo-sharing';
import { Share, Platform } from 'react-native';

export const shareUtils = {
  async shareFile(fileUri: string, mimeType: string = 'application/pdf', dialogTitle: string = 'Share Invoice PDF'): Promise<boolean> {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        return false;
      }

      // Ensure valid MIME type even if caller accidentally passes filename
      let resolvedMimeType = 'application/pdf';
      let resolvedTitle = dialogTitle;

      if (mimeType && mimeType.includes('/')) {
        resolvedMimeType = mimeType;
      } else if (mimeType && !mimeType.includes('/')) {
        resolvedTitle = mimeType;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: resolvedMimeType,
        dialogTitle: resolvedTitle,
        UTI: resolvedMimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
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
