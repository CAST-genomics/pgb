#!/usr/bin/env python3
"""
Generate a concise discrepancy report showing counts and patterns rather than exhaustive lists.
"""

import json
import sys
from collections import defaultdict, Counter

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

def generate_concise_discrepancy_report(json_file_path, output_file_path):
    """Generate concise discrepancy report with counts and patterns."""
    
    print(f"Loading JSON file: {json_file_path}")
    with open(json_file_path, 'r') as f:
        data = json.load(f)
    
    nodes = data.get('node', {})
    print(f"Total nodes found: {len(nodes)}\n")
    
    # Collect all discrepancies
    discrepancies = []
    
    # Track patterns across all nodes
    all_assembly_only_keys = Counter()
    all_pclai_only_keys = Counter()
    
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
            in_assembly_not_pclai = assembly_combinations - valid_pclai_keys
            
            # Keys in valid PCLAI but NOT in assembly
            in_pclai_not_assembly = valid_pclai_keys - assembly_combinations
            
            # Track patterns
            for key in in_assembly_not_pclai:
                all_assembly_only_keys[key] += 1
            for key in in_pclai_not_assembly:
                all_pclai_only_keys[key] += 1
            
            # Analyze patterns
            assembly_only_by_name = defaultdict(set)
            for key in in_assembly_not_pclai:
                parts = key.split('#')
                if len(parts) == 2:
                    assembly_only_by_name[parts[0]].add(parts[1])
            
            pclai_only_by_name = defaultdict(set)
            for key in in_pclai_not_assembly:
                parts = key.split('#')
                if len(parts) == 2:
                    pclai_only_by_name[parts[0]].add(parts[1])
            
            discrepancies.append({
                'node_id': node_id,
                'assembly_count': len(assembly_combinations),
                'valid_pclai_count': len(valid_pclai_keys),
                'invalid_pclai_count': len(invalid_pclai_keys),
                'in_both_count': len(assembly_combinations & valid_pclai_keys),
                'in_assembly_not_pclai_count': len(in_assembly_not_pclai),
                'in_pclai_not_assembly_count': len(in_pclai_not_assembly),
                'assembly_only_by_name': dict(assembly_only_by_name),
                'pclai_only_by_name': dict(pclai_only_by_name)
            })
        elif len(assembly_combinations) > 0 and pclai_coordinates:
            # Node has assembly but no valid PCLAI entries
            discrepancies.append({
                'node_id': node_id,
                'assembly_count': len(assembly_combinations),
                'valid_pclai_count': 0,
                'invalid_pclai_count': len(invalid_pclai_keys),
                'in_both_count': 0,
                'in_assembly_not_pclai_count': len(assembly_combinations),
                'in_pclai_not_assembly_count': 0,
                'assembly_only_by_name': {},
                'pclai_only_by_name': {},
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
    nodes_with_discrepancies = sum(1 for d in discrepancies if d['in_assembly_not_pclai_count'] > 0 or d['in_pclai_not_assembly_count'] > 0)
    nodes_perfect_match = sum(1 for d in discrepancies if d['in_assembly_not_pclai_count'] == 0 and d['in_pclai_not_assembly_count'] == 0)
    
    report_lines.append(f"- **Total nodes with both sections:** {total_nodes}")
    report_lines.append(f"- **Nodes with discrepancies:** {nodes_with_discrepancies}")
    report_lines.append(f"- **Nodes with perfect match:** {nodes_perfect_match}")
    report_lines.append("")
    
    # Overall statistics
    total_assembly_keys = sum(d['assembly_count'] for d in discrepancies)
    total_valid_pclai_keys = sum(d['valid_pclai_count'] for d in discrepancies)
    total_in_both = sum(d['in_both_count'] for d in discrepancies)
    total_in_assembly_not_pclai = sum(d['in_assembly_not_pclai_count'] for d in discrepancies)
    total_in_pclai_not_assembly = sum(d['in_pclai_not_assembly_count'] for d in discrepancies)
    
    report_lines.append("### Overall Statistics")
    report_lines.append("")
    report_lines.append(f"- **Total assembly keys:** {total_assembly_keys}")
    report_lines.append(f"- **Total valid PCLAI keys:** {total_valid_pclai_keys}")
    report_lines.append(f"- **Keys in both:** {total_in_both}")
    report_lines.append(f"- **Keys in assembly but NOT in PCLAI:** {total_in_assembly_not_pclai}")
    report_lines.append(f"- **Keys in PCLAI but NOT in assembly:** {total_in_pclai_not_assembly}")
    report_lines.append("")
    
    # Cross-node patterns
    report_lines.append("### Cross-Node Patterns")
    report_lines.append("")
    
    # Most common keys in assembly but not PCLAI
    if all_assembly_only_keys:
        report_lines.append("**Most common keys in Assembly but NOT in PCLAI (across all nodes):**")
        report_lines.append("")
        top_assembly_only = all_assembly_only_keys.most_common(20)
        for key, count in top_assembly_only:
            report_lines.append(f"- `{key}`: appears in {count} nodes")
        report_lines.append("")
    
    # Most common keys in PCLAI but not assembly
    if all_pclai_only_keys:
        report_lines.append("**Most common keys in PCLAI but NOT in Assembly (across all nodes):**")
        report_lines.append("")
        top_pclai_only = all_pclai_only_keys.most_common(20)
        for key, count in top_pclai_only:
            report_lines.append(f"- `{key}`: appears in {count} nodes")
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
        if disc['in_assembly_not_pclai_count'] > 0:
            report_lines.append(f"#### Keys in Assembly but NOT in PCLAI Coordinates: **{disc['in_assembly_not_pclai_count']}**")
            report_lines.append("")
            
            # Show summary by assembly name
            assembly_only = disc['assembly_only_by_name']
            if len(assembly_only) > 0:
                report_lines.append(f"**Breakdown by assembly ({len(assembly_only)} unique assemblies):**")
                report_lines.append("")
                
                # Group by number of haplotypes
                by_haplotype_count = defaultdict(list)
                for name, haplotypes in assembly_only.items():
                    by_haplotype_count[len(haplotypes)].append((name, sorted(haplotypes)))
                
                # Show assemblies with most haplotypes first
                for count in sorted(by_haplotype_count.keys(), reverse=True):
                    assemblies = sorted(by_haplotype_count[count])
                    if count <= 5:  # Show details for small counts
                        for name, haplotypes in assemblies[:10]:  # Limit to 10 per category
                            report_lines.append(f"- **{name}:** {', '.join(f'#{h}' for h in haplotypes)}")
                        if len(assemblies) > 10:
                            report_lines.append(f"  ... and {len(assemblies) - 10} more assemblies with {count} haplotype(s)")
                    else:
                        report_lines.append(f"- {len(assemblies)} assemblies with {count} haplotypes each")
            report_lines.append("")
        else:
            report_lines.append("#### Keys in Assembly but NOT in PCLAI Coordinates: *None*")
            report_lines.append("")
        
        # Keys in PCLAI but NOT in assembly
        if disc['in_pclai_not_assembly_count'] > 0:
            report_lines.append(f"#### Keys in PCLAI Coordinates but NOT in Assembly: **{disc['in_pclai_not_assembly_count']}**")
            report_lines.append("")
            
            # Show summary by assembly name
            pclai_only = disc['pclai_only_by_name']
            if len(pclai_only) > 0:
                report_lines.append(f"**Breakdown by assembly ({len(pclai_only)} unique assemblies):**")
                report_lines.append("")
                
                # Group by number of haplotypes
                by_haplotype_count = defaultdict(list)
                for name, haplotypes in pclai_only.items():
                    by_haplotype_count[len(haplotypes)].append((name, sorted(haplotypes)))
                
                # Show assemblies with most haplotypes first
                for count in sorted(by_haplotype_count.keys(), reverse=True):
                    assemblies = sorted(by_haplotype_count[count])
                    if count <= 5:  # Show details for small counts
                        for name, haplotypes in assemblies[:15]:  # Show more for PCLAI-only
                            report_lines.append(f"- **{name}:** {', '.join(f'#{h}' for h in haplotypes)}")
                        if len(assemblies) > 15:
                            report_lines.append(f"  ... and {len(assemblies) - 15} more assemblies with {count} haplotype(s)")
                    else:
                        report_lines.append(f"- {len(assemblies)} assemblies with {count} haplotypes each")
            report_lines.append("")
        else:
            report_lines.append("#### Keys in PCLAI Coordinates but NOT in Assembly: *None*")
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
    
    generate_concise_discrepancy_report(json_file, output_file)
