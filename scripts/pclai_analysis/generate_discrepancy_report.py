#!/usr/bin/env python3
"""
Generate a detailed discrepancy report showing:
1. Keys in assembly section but NOT in PCLAI coordinate section
2. Keys in PCLAI coordinate section but NOT in assembly section

Only considers valid PCLAI coordinate entries (non-empty arrays).
"""

import json
import sys

def is_valid_pclai_entry(coord_data):
    """Check if a PCLAI coordinate entry is valid."""
    if not isinstance(coord_data, dict):
        return False
    
    coordinates = coord_data.get('coordinates', [])
    rgb = coord_data.get('RGB', [])
    
    # Check if coordinates array has exactly 2 numeric values
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        return False
    
    # Check if RGB array has exactly 3 numeric values
    if not isinstance(rgb, list) or len(rgb) != 3:
        return False
    
    # Check if values are numeric
    try:
        x, y = float(coordinates[0]), float(coordinates[1])
        r, g, b = float(rgb[0]), float(rgb[1]), float(rgb[2])
        
        # Check RGB range
        if not (0 <= r <= 255) or not (0 <= g <= 255) or not (0 <= b <= 255):
            return False
        
        return True
    except (ValueError, TypeError, IndexError):
        return False

def generate_discrepancy_report(json_file_path, output_file_path):
    """Generate detailed discrepancy report."""
    
    print(f"Loading JSON file: {json_file_path}")
    with open(json_file_path, 'r') as f:
        data = json.load(f)
    
    nodes = data.get('node', {})
    print(f"Total nodes found: {len(nodes)}\n")
    
    # Collect all discrepancies
    discrepancies = []
    
    for node_id, node_data in nodes.items():
        assembly = node_data.get('assembly', [])
        pclai_coordinates = node_data.get('pclai_coordinates', None)
        
        # Build set of assembly/haplotype combinations
        assembly_combinations = set()
        for entry in assembly:
            assembly_name = entry.get('assembly_name', '')
            haplotype = entry.get('haplotype', '')
            if assembly_name and haplotype:
                key = f"{assembly_name}#{haplotype}"
                assembly_combinations.add(key)
        
        # Get valid PCLAI keys
        valid_pclai_keys = set()
        all_pclai_keys = set()
        invalid_pclai_keys = set()
        
        if pclai_coordinates:
            for coord_key, coord_data in pclai_coordinates.items():
                all_pclai_keys.add(coord_key)
                if is_valid_pclai_entry(coord_data):
                    valid_pclai_keys.add(coord_key)
                else:
                    invalid_pclai_keys.add(coord_key)
        
        # Only process nodes with both sections
        if len(assembly_combinations) > 0 and len(valid_pclai_keys) > 0:
            # Keys in assembly but NOT in valid PCLAI
            in_assembly_not_pclai = sorted(assembly_combinations - valid_pclai_keys)
            
            # Keys in valid PCLAI but NOT in assembly
            in_pclai_not_assembly = sorted(valid_pclai_keys - assembly_combinations)
            
            # Keys in both
            in_both = sorted(assembly_combinations & valid_pclai_keys)
            
            discrepancies.append({
                'node_id': node_id,
                'assembly_count': len(assembly_combinations),
                'valid_pclai_count': len(valid_pclai_keys),
                'invalid_pclai_count': len(invalid_pclai_keys),
                'in_both_count': len(in_both),
                'in_assembly_not_pclai': in_assembly_not_pclai,
                'in_pclai_not_assembly': in_pclai_not_assembly,
                'in_both': in_both
            })
        elif len(assembly_combinations) > 0 and pclai_coordinates:
            # Node has assembly but no valid PCLAI entries
            discrepancies.append({
                'node_id': node_id,
                'assembly_count': len(assembly_combinations),
                'valid_pclai_count': 0,
                'invalid_pclai_count': len(invalid_pclai_keys),
                'in_both_count': 0,
                'in_assembly_not_pclai': sorted(assembly_combinations),
                'in_pclai_not_assembly': [],
                'in_both': [],
                'note': 'No valid PCLAI coordinate entries'
            })
    
    # Generate report
    report_lines = []
    report_lines.append("# PCLAI Coordinate vs Assembly Section Discrepancy Report")
    report_lines.append("")
    report_lines.append(f"**Generated:** {sys.argv[0]}")
    report_lines.append(f"**Data File:** {json_file_path}")
    report_lines.append(f"**Total Nodes Analyzed:** {len(discrepancies)}")
    report_lines.append("")
    report_lines.append("---")
    report_lines.append("")
    report_lines.append("## Summary")
    report_lines.append("")
    
    # Summary statistics
    total_nodes = len(discrepancies)
    nodes_with_discrepancies = sum(1 for d in discrepancies if len(d['in_assembly_not_pclai']) > 0 or len(d['in_pclai_not_assembly']) > 0)
    nodes_perfect_match = sum(1 for d in discrepancies if len(d['in_assembly_not_pclai']) == 0 and len(d['in_pclai_not_assembly']) == 0)
    
    report_lines.append(f"- **Total nodes with both sections:** {total_nodes}")
    report_lines.append(f"- **Nodes with discrepancies:** {nodes_with_discrepancies}")
    report_lines.append(f"- **Nodes with perfect match:** {nodes_perfect_match}")
    report_lines.append("")
    
    # Overall statistics
    total_assembly_keys = sum(d['assembly_count'] for d in discrepancies)
    total_valid_pclai_keys = sum(d['valid_pclai_count'] for d in discrepancies)
    total_in_both = sum(d['in_both_count'] for d in discrepancies)
    total_in_assembly_not_pclai = sum(len(d['in_assembly_not_pclai']) for d in discrepancies)
    total_in_pclai_not_assembly = sum(len(d['in_pclai_not_assembly']) for d in discrepancies)
    
    report_lines.append("### Overall Statistics")
    report_lines.append("")
    report_lines.append(f"- **Total assembly keys:** {total_assembly_keys}")
    report_lines.append(f"- **Total valid PCLAI keys:** {total_valid_pclai_keys}")
    report_lines.append(f"- **Keys in both:** {total_in_both}")
    report_lines.append(f"- **Keys in assembly but NOT in PCLAI:** {total_in_assembly_not_pclai}")
    report_lines.append(f"- **Keys in PCLAI but NOT in assembly:** {total_in_pclai_not_assembly}")
    report_lines.append("")
    report_lines.append("---")
    report_lines.append("")
    report_lines.append("## Detailed Node-by-Node Report")
    report_lines.append("")
    
    # Sort nodes by ID
    discrepancies.sort(key=lambda x: x['node_id'])
    
    for disc in discrepancies:
        node_id = disc['node_id']
        report_lines.append(f"### Node: {node_id}")
        report_lines.append("")
        report_lines.append(f"**Assembly combinations:** {disc['assembly_count']}")
        report_lines.append(f"**Valid PCLAI keys:** {disc['valid_pclai_count']}")
        if disc.get('invalid_pclai_count', 0) > 0:
            report_lines.append(f"**Invalid PCLAI entries (excluded):** {disc['invalid_pclai_count']}")
        report_lines.append(f"**Keys in both:** {disc['in_both_count']}")
        if disc.get('note'):
            report_lines.append(f"**Note:** {disc['note']}")
        report_lines.append("")
        
        # Keys in assembly but NOT in PCLAI
        if len(disc['in_assembly_not_pclai']) > 0:
            report_lines.append(f"#### Keys in Assembly but NOT in PCLAI Coordinates ({len(disc['in_assembly_not_pclai'])}):")
            report_lines.append("")
            # Group by assembly name for readability
            assembly_groups = {}
            for key in disc['in_assembly_not_pclai']:
                parts = key.split('#')
                if len(parts) == 2:
                    assembly_name = parts[0]
                    haplotype = parts[1]
                    if assembly_name not in assembly_groups:
                        assembly_groups[assembly_name] = []
                    assembly_groups[assembly_name].append(haplotype)
            
            for assembly_name in sorted(assembly_groups.keys()):
                haplotypes = sorted(assembly_groups[assembly_name])
                report_lines.append(f"- **{assembly_name}:** {', '.join(f'#{h}' for h in haplotypes)}")
            report_lines.append("")
        else:
            report_lines.append("#### Keys in Assembly but NOT in PCLAI Coordinates: *None*")
            report_lines.append("")
        
        # Keys in PCLAI but NOT in assembly
        if len(disc['in_pclai_not_assembly']) > 0:
            report_lines.append(f"#### Keys in PCLAI Coordinates but NOT in Assembly ({len(disc['in_pclai_not_assembly'])}):")
            report_lines.append("")
            # Group by assembly name for readability
            assembly_groups = {}
            for key in disc['in_pclai_not_assembly']:
                parts = key.split('#')
                if len(parts) == 2:
                    assembly_name = parts[0]
                    haplotype = parts[1]
                    if assembly_name not in assembly_groups:
                        assembly_groups[assembly_name] = []
                    assembly_groups[assembly_name].append(haplotype)
            
            for assembly_name in sorted(assembly_groups.keys()):
                haplotypes = sorted(assembly_groups[assembly_name])
                report_lines.append(f"- **{assembly_name}:** {', '.join(f'#{h}' for h in haplotypes)}")
            report_lines.append("")
        else:
            report_lines.append("#### Keys in PCLAI Coordinates but NOT in Assembly: *None*")
            report_lines.append("")
        
        # Show overlap if small enough
        if len(disc['in_both']) > 0 and len(disc['in_both']) <= 50:
            report_lines.append(f"#### Keys in Both ({len(disc['in_both'])}):")
            report_lines.append("")
            report_lines.append(", ".join(disc['in_both']))
            report_lines.append("")
        elif len(disc['in_both']) > 50:
            report_lines.append(f"#### Keys in Both ({len(disc['in_both'])}):")
            report_lines.append("")
            report_lines.append(f"*Too many to list (showing first 20):* {', '.join(disc['in_both'][:20])}...")
            report_lines.append("")
        
        report_lines.append("---")
        report_lines.append("")
    
    # Write report
    report_content = "\n".join(report_lines)
    with open(output_file_path, 'w') as f:
        f.write(report_content)
    
    print(f"Report generated: {output_file_path}")
    print(f"Total nodes analyzed: {len(discrepancies)}")
    print(f"Nodes with discrepancies: {nodes_with_discrepancies}")

if __name__ == '__main__':
    json_file = '/Users/turner/PanGenomeProject/pgb/public/hprc-project/hello-hprc.json'
    output_file = '/Users/turner/PanGenomeProject/pgb/pclai_assembly_discrepancy_report.md'
    
    if len(sys.argv) > 1:
        json_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    
    generate_discrepancy_report(json_file, output_file)
