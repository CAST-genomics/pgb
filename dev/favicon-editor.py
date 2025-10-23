#!/usr/bin/env python3
"""
Update the favicon.ico file with thin font for "PGB" text.
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_thin_favicon():
    # Create a 32x32 image with white background
    # To run the script: python3 dev/update_favicon_thin.py
    size = 32
    img = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    # Add thin black border
    border_width = 1
    draw.rectangle([0, 0, size-1, size-1], outline=(0, 0, 0, 255), width=border_width)
    
    # Try to use a thin font, fallback to default
    try:
        # Try Helvetica Light or similar thin font
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12)
    except:
        try:
            # Try Arial Light
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 12)
        except:
            try:
                # Try SF Pro Text Light
                font = ImageFont.truetype("/System/Library/Fonts/SF-Pro-Text-Light.otf", 12)
            except:
                try:
                    # Try system thin font
                    font = ImageFont.truetype("/System/Library/Fonts/SF-Pro-Text-Thin.otf", 12)
                except:
                    # Fallback to default font
                    font = ImageFont.load_default()
    
    # Calculate text position to center it
    text = "PGB"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - 1  # Slight adjustment for better centering
    
    # Draw the text in black with thin weight
    draw.text((x, y), text, fill=(0, 0, 0, 255), font=font)
    
    # Save as ICO file
    output_path = "../public/favicon.ico"
    img.save(output_path, format='ICO', sizes=[(32, 32), (16, 16)])
    print(f"Updated favicon with thin font and border created successfully at {output_path}")
    print(f"Font: Thin/Regular, Size: 12px, Text: {text}, Border: 1px black")

if __name__ == "__main__":
    create_thin_favicon()
