/**
 * Bill PDF Generator — Professional Indian electricity bill using jsPDF
 *
 * Layout modeled after real SBPDCL/MGVCL DISCOM bills.
 * Renders: header, consumer details, meter details, slab breakdown,
 * ToD breakdown, tax summary, and grand total.
 */

import jsPDF from 'jspdf';
import type { BillData } from './backend';

// ── Constants ─────────────────────────────────────────────────────

const MARGIN = 20;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const COLORS = {
    primary: [15, 23, 42] as [number, number, number],       // slate-900
    secondary: [71, 85, 105] as [number, number, number],    // slate-500
    accent: [6, 182, 212] as [number, number, number],       // cyan-500
    light: [241, 245, 249] as [number, number, number],      // slate-100
    white: [255, 255, 255] as [number, number, number],
    black: [0, 0, 0] as [number, number, number],
    green: [16, 185, 129] as [number, number, number],       // emerald-500
    red: [239, 68, 68] as [number, number, number],          // red-500
};

// ── Helpers ───────────────────────────────────────────────────────

// FIX 1: Changed ₹ to Rs. to prevent jsPDF encoding errors and truncation
function rupee(n: number): string {
    return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawLine(doc: jsPDF, y: number, dashed = false) {
    doc.setDrawColor(...COLORS.light);
    doc.setLineWidth(0.3);
    if (dashed) {
        doc.setLineDashPattern([2, 2], 0);
    }
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    doc.setLineDashPattern([], 0);
}

function sectionHeader(doc: jsPDF, y: number, title: string): number {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.accent);
    doc.text(title, MARGIN, y);
    y += 2;
    drawLine(doc, y);
    return y + 5;
}

function labelValue(doc: jsPDF, y: number, label: string, value: string, x = MARGIN): number {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.secondary);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text(value, x + 55, y);
    return y + 5;
}

// ── Main Generator ────────────────────────────────────────────────

export function generateBillPdf(bill: BillData): Blob {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = MARGIN;

    // ── Header ─────────────────────────────────────────────────
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, PAGE_WIDTH, 35, 'F');

    // FIX 2: Removed emoji (⚡) and changed branding to IntelliSmart
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('IntelliSmart', MARGIN, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Electricity Bill Statement', MARGIN, 22);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${bill.month_name} ${bill.year}`, PAGE_WIDTH - MARGIN, 15, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`DISCOM: ${bill.discom_code}`, PAGE_WIDTH - MARGIN, 22, { align: 'right' });
    doc.text(`Plan: ${bill.plan_name}`, PAGE_WIDTH - MARGIN, 28, { align: 'right' });

    y = 45;

    // ── Consumer Details ───────────────────────────────────────
    y = sectionHeader(doc, y, 'CONSUMER DETAILS');

    const leftCol = MARGIN;
    const rightCol = MARGIN + CONTENT_WIDTH / 2;

    // Row 1
    y = labelValue(doc, y, 'Consumer Name', bill.consumer_name, leftCol);
    labelValue(doc, y - 5, 'Meter Number', bill.meter_number, rightCol);
    
    // Row 2
    y = labelValue(doc, y, 'Consumer No.', bill.consumer_number || '—', leftCol);
    labelValue(doc, y - 5, 'Meter Type', bill.meter_type.toUpperCase(), rightCol);
    
    // Row 3 & 4 (FIX: Dedicated full-width rows to prevent long name overlap)
    y = labelValue(doc, y, 'Sanctioned Load', `${bill.sanctioned_load_kw} kW`, leftCol);
    y = labelValue(doc, y, 'DISCOM', bill.discom_name, leftCol);

    y += 3;

    // ── Consumption Summary ────────────────────────────────────
    doc.setFillColor(...COLORS.light);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 18, 3, 3, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);

    const thirdWidth = CONTENT_WIDTH / 3;
    doc.text('Total Units', MARGIN + thirdWidth * 0 + 10, y + 7);
    doc.text(`${bill.total_kwh} kWh`, MARGIN + thirdWidth * 0 + 10, y + 13);

    doc.text('Data Source', MARGIN + thirdWidth * 1 + 10, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const sourceLabel = bill.data_source === 'interval_readings'
        ? `Smart Meter (${bill.interval_count} intervals)`
        : 'Daily Aggregates (estimated)';
    doc.text(sourceLabel, MARGIN + thirdWidth * 1 + 10, y + 13);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Grand Total', MARGIN + thirdWidth * 2 + 10, y + 7);
    doc.setTextColor(...COLORS.accent);
    doc.setFontSize(12);
    doc.text(rupee(bill.total_amount), MARGIN + thirdWidth * 2 + 10, y + 14);

    y += 25;

    // ── Slab Breakdown Table ───────────────────────────────────
    y = sectionHeader(doc, y, 'TELESCOPIC SLAB BREAKDOWN');

    doc.setFillColor(...COLORS.primary);
    doc.rect(MARGIN, y - 3, CONTENT_WIDTH, 7, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('Slab Range', MARGIN + 3, y + 1);
    doc.text('Rate (Rs./kWh)', MARGIN + 50, y + 1); // Rs. fix
    doc.text('Units (kWh)', MARGIN + 90, y + 1);
    doc.text('Amount (Rs.)', MARGIN + 130, y + 1); // Rs. fix
    y += 7;

    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    let slabTotal = 0;
    for (const slab of bill.slab_breakdown) {
        const range = slab.to_kwh !== null
            ? `${slab.from_kwh} – ${slab.to_kwh} kWh`
            : `${slab.from_kwh}+ kWh`;
        doc.text(range, MARGIN + 3, y);
        doc.text(`Rs. ${slab.rate_per_kwh.toFixed(2)}`, MARGIN + 50, y);
        doc.text(`${slab.kwh_billed.toFixed(2)}`, MARGIN + 90, y);
        doc.text(rupee(slab.cost), MARGIN + 130, y);
        slabTotal += slab.cost;
        y += 5;
    }

    drawLine(doc, y - 2, true);
    doc.setFont('helvetica', 'bold');
    doc.text('Base Energy Charge', MARGIN + 3, y + 2);
    doc.text(rupee(slabTotal), MARGIN + 130, y + 2);
    y += 8;

    // ── ToD Breakdown ──────────────────────────────────────────
    y = sectionHeader(doc, y, 'TIME-OF-DAY (ToD) ADJUSTMENT');

    doc.setFillColor(241, 245, 249);
    doc.rect(MARGIN, y - 3, CONTENT_WIDTH, 7, 'F');
    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    
    // FIX 3: Adjusted column widths to prevent overlapping text
    doc.text('Period', MARGIN + 3, y + 1);
    doc.text('Units (kWh)', MARGIN + 80, y + 1); 
    doc.text('Adjustment (Rs.)', MARGIN + 130, y + 1); 
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    // FIX 4: Clearer UX Labels for consumers
    const todLabels: Record<string, string> = {
        'off-peak': 'Off-Peak Rebate (Savings)',
        'normal': 'Normal Hours (Base Rate)',
        'peak': 'Peak Surcharge (Penalty)',
    };

    let totalTodAdj = 0;
    for (const [type, data] of Object.entries(bill.tod_breakdown)) {
        if (data.kwh === 0) continue;
        doc.text(todLabels[type] || type, MARGIN + 3, y);
        doc.text(`${data.kwh.toFixed(2)}`, MARGIN + 80, y); // Aligned with new header
        const adjColor = data.adjustment < 0 ? COLORS.green : data.adjustment > 0 ? COLORS.red : COLORS.primary;
        doc.setTextColor(...adjColor);
        const sign = data.adjustment >= 0 ? '+' : '';
        doc.text(`${sign}${rupee(data.adjustment)}`, MARGIN + 130, y); // Aligned with new header
        doc.setTextColor(...COLORS.primary);
        totalTodAdj += data.adjustment;
        y += 5;
    }

    drawLine(doc, y - 2, true);
    doc.setFont('helvetica', 'bold');
    doc.text('Net ToD Adjustment', MARGIN + 3, y + 2);
    const netAdjColor = totalTodAdj < 0 ? COLORS.green : totalTodAdj > 0 ? COLORS.red : COLORS.primary;
    doc.setTextColor(...netAdjColor);
    const netSign = totalTodAdj >= 0 ? '+' : '';
    doc.text(`${netSign}${rupee(totalTodAdj)}`, MARGIN + 130, y + 2);
    doc.setTextColor(...COLORS.primary);
    y += 10;

    // ── Bill Summary ───────────────────────────────────────────
    y = sectionHeader(doc, y, 'BILL SUMMARY');

    const summaryItems = [
        ['Energy Charge (Slabs)', rupee(bill.energy_charge - bill.tod_adjustment)],
        ['ToD Adjustment', `${totalTodAdj >= 0 ? '+' : ''}${rupee(bill.tod_adjustment)}`],
        [`Fixed Charge (${bill.sanctioned_load_kw} kW)`, rupee(bill.fixed_charge)],
        ['Electricity Duty (6%)', rupee(bill.electricity_duty)],
        ['Fuel Adj. Charge (Rs. 0.10/kWh)', rupee(bill.fac)], // Rs. fix
    ];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (const [label, value] of summaryItems) {
        doc.setTextColor(...COLORS.secondary);
        doc.text(label, MARGIN + 3, y);
        doc.setTextColor(...COLORS.primary);
        // Align amounts nicely
        doc.text(value, MARGIN + 130, y); 
        y += 5;
    }

    y += 2;
    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 12, 2, 2, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PAYABLE', MARGIN + 5, y + 8);
    doc.setFontSize(14);
    
    // Now that Rs. is used, right alignment will calculate width perfectly without truncating
    doc.text(rupee(bill.total_amount), PAGE_WIDTH - MARGIN - 5, y + 8, { align: 'right' });

    // ── Footer ─────────────────────────────────────────────────
    const footerY = 280;
    drawLine(doc, footerY);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.secondary);
    doc.text('Generated by IntelliSmart Infrastructure — This is a computer-generated document.', MARGIN, footerY + 4);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, PAGE_WIDTH - MARGIN, footerY + 4, { align: 'right' });

    return doc.output('blob');
}

export function downloadBillPdf(bill: BillData) {
    const blob = generateBillPdf(bill);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IntelliSmart_Bill_${bill.month_name}_${bill.year}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}