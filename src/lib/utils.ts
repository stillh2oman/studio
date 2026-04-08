import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Standard default rendering used when a project has no specified image.
 */
export const DEFAULT_PROJECT_RENDERING = "https://www.dropbox.com/scl/fi/ns9ubfzhffkmxmquipbfl/Laptop-Background.PNG?rlkey=pno6u0tlfgzqx6jps7r4x7bi9&dl=1";

/**
 * Transforms a standard Dropbox shared link into a direct content link 
 * suitable for embedding in an <img> tag.
 */
export function formatDropboxUrl(url?: string) {
  if (!url) return null;
  let formatted = url.trim();
  
  // If it's a Base64 data URI (local upload), return as-is
  if (formatted.startsWith('data:image')) return formatted;

  if (formatted.includes('dropbox.com')) {
    const isSclFi = formatted.includes('dropbox.com/scl/fi/');
    // For modern /scl/fi links, keep www.dropbox.com and force raw=1.
    // Swapping to dl.dropboxusercontent.com is unreliable for some scl links.
    if (!isSclFi) {
      // Switch to direct content domain for legacy shared links.
      formatted = formatted.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    }
    
    // Force direct download/raw mode to bypass HTML landing page
    if (formatted.includes('?')) {
      // Handle existing parameters by appending/replacing
      if (formatted.includes('dl=0') || formatted.includes('dl=1')) {
        formatted = formatted.replace(/\?dl=[01]/, '?raw=1').replace(/&dl=[01]/, '&raw=1');
      } else if (!formatted.includes('raw=1')) {
        formatted = formatted + '&raw=1';
      }
    } else {
      formatted = formatted + '?raw=1';
    }
  }
  
  return formatted;
}

/**
 * Compresses an image data URL by resizing it and reducing quality.
 * Helps prevent hitting Firestore 1MB limits and speeds up dashboard loading.
 */
export async function compressImage(dataUrl: string, maxWidth = 800, quality = 0.6): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = dataUrl;
    img.onerror = (err) => reject(err);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Maintain aspect ratio while constraining width
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl); // Fallback to original if canvas fails
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      
      // Output as compressed JPEG
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
  });
}
