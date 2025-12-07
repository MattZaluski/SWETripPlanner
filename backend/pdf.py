from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib import colors
from reportlab.lib.units import inch
import io

def generate_itinerary_pdf(trip):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name='TitleStyle',
        parent=styles['Title'],
        fontSize=28,
        textColor=colors.HexColor("#6b4e3d"),
        alignment=1,
        spaceAfter=20
    )

    header_style = ParagraphStyle(
        name='HeaderStyle',
        parent=styles['Heading2'],
        textColor=colors.HexColor("#b88a63"),
        fontSize=18,
        spaceAfter=10
    )

    normal = styles['BodyText']

    elements = []

    # -------------------------------
    # BEAUTIFUL HEADER BANNER
    # -------------------------------
    banner = Table(
        [["Your Personalized Travel Itinerary"]],
        colWidths=[7.5 * inch]
    )

    banner.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#deb892")),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.white),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTSIZE', (0,0), (-1,-1), 20),
        ('BOTTOMPADDING', (0,0), (-1,-1), 20),
        ('TOPPADDING', (0,0), (-1,-1), 20),
    ]))

    elements.append(banner)
    elements.append(Spacer(1, 18))

    # -------------------------------
    # TITLE SECTION
    # -------------------------------
    title = f"{trip.get('starting_address', 'Trip')} Journey"
    elements.append(Paragraph(title, title_style))
    elements.append(Spacer(1, 10))

    # Divider
    elements.append(HRFlowable(width="100%", color=colors.HexColor("#b88a63"), thickness=2))
    elements.append(Spacer(1, 20))

    # -------------------------------
    # TRIP SUMMARY
    # -------------------------------
    elements.append(Paragraph("Trip Overview", header_style))

    summary_html = f"""
        <b>Budget Level:</b> {trip.get('budget', 'N/A')}<br/>
        <b>Interests:</b> {", ".join(trip.get('interests', []))}<br/>
        <b>Travel Mode:</b> {trip.get('travel_mode', 'N/A')}<br/>
        <b>Max Distance:</b> {trip.get('max_distance', 'N/A')} km<br/>
    """

    elements.append(Paragraph(summary_html, normal))
    elements.append(Spacer(1, 20))

    # --------------------------------
    # PROFESSIONAL FILLER SECTIONS
    # --------------------------------

    # ABOUT THIS ITINERARY
    elements.append(Paragraph("About This Itinerary", header_style))
    elements.append(Paragraph("""
        This itinerary was created to provide clarity, structure, and convenience for your trip.
        It outlines your key stops, expected travel details, and general expectations, giving you
        a simple guide to follow while still allowing flexibility during your journey.
    """, normal))
    elements.append(Spacer(1, 20))

    # Divider before table
    elements.append(HRFlowable(width="100%", color=colors.HexColor("#b88a63"), thickness=1))
    elements.append(Spacer(1, 10))

    # -------------------------------
    # PLACES TABLE (Stylish)
    # -------------------------------
    elements.append(Paragraph("Your Itinerary Stops", header_style))

    table_data = [["Place", "Cost", "Time", "Distance"]]

    for i, p in enumerate(trip["places"]):
        row_color = colors.whitesmoke if i % 2 == 0 else colors.HexColor("#f7efe6")
        table_data.append([
            p.get("name", "N/A"),
            p.get("cost", "Unknown"),
            p.get("duration", "—"),
            f"{p.get('distance_km', '—')} km"
        ])

    table = Table(table_data, colWidths=[180, 80, 80, 80])

    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#6b4e3d")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.whitesmoke, colors.HexColor("#f7efe6")]),
    ]))

    elements.append(table)

    # HOW TO USE THIS GUIDE
    elements.append(Paragraph("How to Use This Guide", header_style))
    elements.append(Paragraph("""
        Use this itinerary as a reference throughout your trip. Each stop includes estimated costs,
        timing, and distance to help you plan your day efficiently. While the details here offer a
        useful snapshot, always adjust based on real-world conditions and your personal comfort.
    """, normal))
    elements.append(Spacer(1, 20))

    # TRAVEL NOTES
    elements.append(Paragraph("Travel Notes", header_style))
    elements.append(Paragraph("""
        • Timings and distances are approximate and may vary.<br/>
        • Check local conditions and availability when you arrive.<br/>
        • Feel free to adjust the plan based on your pace and interests.<br/>
        • Take breaks, stay safe, and enjoy the experience.
    """, normal))
    elements.append(Spacer(1, 20))

    doc.build(elements)
    return buffer.getvalue()
