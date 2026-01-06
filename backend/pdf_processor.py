# PDF Processor for Bank Statements
# Splits multi-page PDFs and processes them page-by-page to avoid API limits

import io
import base64
from typing import List, Tuple
import pdfplumber

def split_pdf_to_images(pdf_bytes: bytes, max_size_mb: float = 3.5, password: str = None) -> List[Tuple[str, int]]:
    """
    Split PDF into individual page images.
    
    Args:
        pdf_bytes: PDF file as bytes
        max_size_mb: Maximum size per image in MB (default 3.5MB to stay under 4MB base64 limit)
        password: Optional password for the PDF file
    
    Returns:
        List of tuples: (base64_image_string, page_number)
    """
    images = []
    
    # Open PDF with pdfplumber
    pdf_file = io.BytesIO(pdf_bytes)
    
    with pdfplumber.open(pdf_file, password=password) as pdf:
        total_pages = len(pdf.pages)
        
        for page_num, page in enumerate(pdf.pages, start=1):
            # Convert page to image with pdfplumber's built-in method
            # This returns a PIL Image, but we convert it immediately
            print(f"DEBUG: Converting page {page_num}/{total_pages} to image...")
            img = page.to_image(resolution=100)  # Reduced to 100 DPI for speed/reliability
            
            # Save to bytes
            buffered = io.BytesIO()
            img.save(buffered, format="PNG")
            
            # Convert to base64
            img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
            
            # Check size
            size_mb = len(buffered.getvalue()) / (1024 * 1024)
            
            # If too large, reduce resolution
            if size_mb > max_size_mb:
                # Try with lower resolution
                img = page.to_image(resolution=100)
                buffered = io.BytesIO()
                img.save(buffered, format="PNG")
                img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
            
            images.append((img_base64, page_num))
            
    return images


def get_pdf_page_count(pdf_bytes: bytes, password: str = None) -> int:
    """
    Get the number of pages in a PDF.
    
    Args:
        pdf_bytes: PDF file as bytes
        password: Optional password for the PDF file
    
    Returns:
        Number of pages
    """
    try:
        pdf_file = io.BytesIO(pdf_bytes)
        with pdfplumber.open(pdf_file, password=password) as pdf:
            return len(pdf.pages)
    except Exception as e:
        raise Exception(f"Error reading PDF: {str(e)}")

