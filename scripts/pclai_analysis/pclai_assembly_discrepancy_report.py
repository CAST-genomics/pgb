#!/usr/bin/env python3
"""
Generate a simple table showing per-node discrepancies.
Columns:
- Node
- Total Assembly keys
- Total PCLAI keys  
- Total keys (union)
- Assembly keys NOT in PCLAI
- PCLAI keys NOT in Assembly
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

def generate_simple_table(json_file_path, output_file_path):
    """Generate simple discrepancy table."""
    
    print(f"Loading JSON file: {json_file_path}")
    with open(json_file_path, 'r') as f:
        data = json.load(f)
    
    nodes = data.get('node', {})
    print(f"Total nodes found: {len(nodes)}\n")
    
    # Collect discrepancies
    rows = []
    
    for node_id, node_data in nodes.items():
        assembly = node_data.get('assembly', [])
        pclai_coordinates = node_data.get('pclai_coordinates', None)
        
        # Build set of assembly/haplotype combinations
        # Key format: assembly_name#haplotype
        assembly_combinations = set()
        for entry in assembly:
            assembly_name = entry.get('assembly_name', '')
            haplotype = entry.get('haplotype', '')
            if assembly_name and haplotype:
                key = f"{assembly_name}#{haplotype}"
                assembly_combinations.add(key)
        
        # Get valid PCLAI keys (these are explicit in the dataset)
        valid_pclai_keys = set()
        
        if pclai_coordinates:
            for coord_key, coord_data in pclai_coordinates.items():
                if is_valid_pclai_entry(coord_data):
                    valid_pclai_keys.add(coord_key)
        
        # Only include nodes with both sections
        if len(assembly_combinations) > 0 and len(valid_pclai_keys) > 0:
            # Keys in assembly but NOT in valid PCLAI
            in_assembly_not_pclai = len(assembly_combinations - valid_pclai_keys)
            
            # Keys in valid PCLAI but NOT in assembly
            in_pclai_not_assembly = len(valid_pclai_keys - assembly_combinations)
            
            # Total keys (union of both sets)
            total_keys = len(assembly_combinations | valid_pclai_keys)
            
            # Keys in both (intersection)
            keys_in_both = len(assembly_combinations & valid_pclai_keys)
            
            rows.append({
                'node_id': node_id,
                'total_assembly_keys': len(assembly_combinations),
                'total_pclai_keys': len(valid_pclai_keys),
                'total_keys': total_keys,
                'keys_in_both': keys_in_both,
                'assembly_not_pclai': in_assembly_not_pclai,
                'pclai_not_assembly': in_pclai_not_assembly
            })
        elif len(assembly_combinations) > 0 and pclai_coordinates:
            # Node has assembly but no valid PCLAI entries
            rows.append({
                'node_id': node_id,
                'total_assembly_keys': len(assembly_combinations),
                'total_pclai_keys': 0,
                'total_keys': len(assembly_combinations),
                'keys_in_both': 0,
                'assembly_not_pclai': len(assembly_combinations),
                'pclai_not_assembly': 0
            })
    
    # Sort by node ID
    rows.sort(key=lambda x: x['node_id'])
    
    # Generate markdown table
    report_lines = []
    report_lines.append("# PCLAI Coordinate vs Assembly Section Discrepancy Table")
    report_lines.append("")
    report_lines.append(f"**Data File:** {json_file_path}")
    report_lines.append(f"**Total Nodes:** {len(rows)}")
    report_lines.append("")
    report_lines.append("| Node | Total Assembly Keys | Total PCLAI Keys | Total Keys (Union) | Keys in Both (Intersection) | Assembly keys NOT in PCLAI | PCLAI keys NOT in Assembly |")
    report_lines.append("|------|---------------------|------------------|--------------------|----------------------------|----------------------------|----------------------------|")
    
    for row in rows:
        node_id = row['node_id']
        total_assembly = row['total_assembly_keys']
        total_pclai = row['total_pclai_keys']
        total_keys = row['total_keys']
        keys_in_both = row['keys_in_both']
        assembly_not_pclai = row['assembly_not_pclai']
        pclai_not_assembly = row['pclai_not_assembly']
        
        # Show empty string if count is 0 for discrepancy columns
        assembly_str = str(assembly_not_pclai) if assembly_not_pclai > 0 else ""
        pclai_str = str(pclai_not_assembly) if pclai_not_assembly > 0 else ""
        
        report_lines.append(f"| {node_id} | {total_assembly} | {total_pclai} | {total_keys} | {keys_in_both} | {assembly_str} | {pclai_str} |")
    
    # Add summary statistics
    report_lines.append("")
    report_lines.append("## Summary")
    report_lines.append("")
    total_assembly_keys = sum(r['total_assembly_keys'] for r in rows)
    total_pclai_keys = sum(r['total_pclai_keys'] for r in rows)
    total_all_keys = sum(r['total_keys'] for r in rows)
    total_keys_in_both = sum(r['keys_in_both'] for r in rows)
    total_assembly_not_pclai = sum(r['assembly_not_pclai'] for r in rows)
    total_pclai_not_assembly = sum(r['pclai_not_assembly'] for r in rows)
    nodes_with_assembly_discrepancies = sum(1 for r in rows if r['assembly_not_pclai'] > 0)
    nodes_with_pclai_discrepancies = sum(1 for r in rows if r['pclai_not_assembly'] > 0)
    
    report_lines.append(f"- **Total nodes:** {len(rows)}")
    report_lines.append(f"- **Total assembly keys (across all nodes):** {total_assembly_keys}")
    report_lines.append(f"- **Total PCLAI keys (across all nodes):** {total_pclai_keys}")
    report_lines.append(f"- **Total unique keys (union across all nodes):** {total_all_keys}")
    report_lines.append(f"- **Total keys in both (intersection across all nodes):** {total_keys_in_both}")
    report_lines.append(f"- **Nodes with assembly keys NOT in PCLAI:** {nodes_with_assembly_discrepancies}")
    report_lines.append(f"- **Nodes with PCLAI keys NOT in assembly:** {nodes_with_pclai_discrepancies}")
    report_lines.append(f"- **Total assembly keys NOT in PCLAI:** {total_assembly_not_pclai}")
    report_lines.append(f"- **Total PCLAI keys NOT in assembly:** {total_pclai_not_assembly}")
    
    # Write report
    report_content = "\n".join(report_lines)
    with open(output_file_path, 'w') as f:
        f.write(report_content)
    
    print(f"Report generated: {output_file_path}")
    print(f"Total nodes: {len(rows)}")
    print(f"Total assembly keys: {total_assembly_keys}")
    print(f"Total PCLAI keys: {total_pclai_keys}")
    print(f"Nodes with assembly discrepancies: {nodes_with_assembly_discrepancies}")
    print(f"Nodes with PCLAI discrepancies: {nodes_with_pclai_discrepancies}")

if __name__ == '__main__':
    json_file = '/Users/turner/PanGenomeProject/pgb/public/hprc-project/hello-hprc.json'
    output_file = '/Users/turner/PanGenomeProject/pgb/pclai_assembly_discrepancy_report.md'
    
    if len(sys.argv) > 1:
        json_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    
    generate_simple_table(json_file, output_file)
