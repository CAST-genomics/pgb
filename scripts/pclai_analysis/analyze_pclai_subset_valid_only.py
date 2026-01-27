#!/usr/bin/env python3
"""
Analyze the relationship between valid PCLAI coordinate keys and assembly/haplotype combinations.

For each node that has both assembly and pclai_coordinates sections:
- Extract assembly/haplotype combinations from assembly section (format: assembly_name#haplotype)
- Extract VALID keys from pclai_coordinates section (only entries with non-empty coordinates and RGB)
- Verify that valid pclai_coordinates keys are a subset of assembly combinations
"""

import json
import sys
from collections import defaultdict

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

def analyze_pclai_subset_valid_only(json_file_path):
    """Analyze if valid PCLAI coordinate keys are a subset of assembly/haplotype combinations."""
    
    print(f"Loading JSON file: {json_file_path}")
    with open(json_file_path, 'r') as f:
        data = json.load(f)
    
    nodes = data.get('node', {})
    print(f"Total nodes found: {len(nodes)}\n")
    
    # Statistics
    nodes_with_both = 0
    nodes_with_assembly_only = 0
    nodes_with_pclai_only = 0
    nodes_with_neither = 0
    
    # Track discrepancies
    discrepancies = []
    all_valid = True
    
    # Track valid vs invalid PCLAI entries
    total_pclai_entries = 0
    valid_pclai_entries = 0
    invalid_pclai_entries = 0
    
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
        
        # Check what sections exist
        has_assembly = len(assembly) > 0
        has_pclai = pclai_coordinates is not None and len(pclai_coordinates) > 0
        
        if has_assembly and has_pclai:
            nodes_with_both += 1
            
            # Extract VALID PCLAI coordinate keys only
            valid_pclai_keys = set()
            for coord_key, coord_data in pclai_coordinates.items():
                total_pclai_entries += 1
                if is_valid_pclai_entry(coord_data):
                    valid_pclai_keys.add(coord_key)
                    valid_pclai_entries += 1
                else:
                    invalid_pclai_entries += 1
            
            # Only proceed if there are valid PCLAI keys
            if len(valid_pclai_keys) > 0:
                # Check if valid PCLAI keys are a subset of assembly combinations
                missing_in_assembly = valid_pclai_keys - assembly_combinations
                
                if missing_in_assembly:
                    all_valid = False
                    discrepancies.append({
                        'node_id': node_id,
                        'missing_keys': sorted(missing_in_assembly),
                        'valid_pclai_count': len(valid_pclai_keys),
                        'assembly_count': len(assembly_combinations),
                        'invalid_pclai_count': total_pclai_entries - valid_pclai_entries
                    })
            else:
                # Node has pclai_coordinates but no valid entries
                discrepancies.append({
                    'node_id': node_id,
                    'issue': 'No valid PCLAI coordinate entries',
                    'total_entries': total_pclai_entries,
                    'assembly_count': len(assembly_combinations)
                })
        elif has_assembly:
            nodes_with_assembly_only += 1
        elif has_pclai:
            nodes_with_pclai_only += 1
        else:
            nodes_with_neither += 1
    
    # Print summary
    print("=" * 80)
    print("ANALYSIS SUMMARY")
    print("=" * 80)
    print(f"Nodes with both assembly and pclai_coordinates: {nodes_with_both}")
    print(f"Nodes with assembly only: {nodes_with_assembly_only}")
    print(f"Nodes with pclai_coordinates only: {nodes_with_pclai_only}")
    print(f"Nodes with neither: {nodes_with_neither}")
    print()
    print(f"PCLAI Coordinate Entry Statistics:")
    print(f"  Total PCLAI entries: {total_pclai_entries}")
    print(f"  Valid entries: {valid_pclai_entries} ({valid_pclai_entries/total_pclai_entries*100:.2f}%)")
    print(f"  Invalid entries (empty/malformed): {invalid_pclai_entries} ({invalid_pclai_entries/total_pclai_entries*100:.2f}%)")
    print()
    
    if nodes_with_both == 0:
        print("No nodes found with both assembly and pclai_coordinates sections.")
        return
    
    print("=" * 80)
    print("SUBSET VERIFICATION (VALID PCLAI COORDINATES ONLY)")
    print("=" * 80)
    
    # Filter out nodes with no valid entries from discrepancy count for subset analysis
    subset_discrepancies = [d for d in discrepancies if 'missing_keys' in d]
    nodes_with_valid_pclai = nodes_with_both - len([d for d in discrepancies if 'issue' in d])
    
    if all_valid and len(subset_discrepancies) == 0:
        print("✓ SUCCESS: All valid PCLAI coordinate keys are subsets of assembly/haplotype combinations!")
        print(f"✓ Verified {nodes_with_valid_pclai} nodes with valid PCLAI coordinates")
    else:
        print(f"✗ FOUND {len(subset_discrepancies)} DISCREPANCIES:")
        print()
        for disc in subset_discrepancies:
            print(f"  Node: {disc['node_id']}")
            print(f"    Valid PCLAI keys missing from assembly section: {len(disc['missing_keys'])}")
            if len(disc['missing_keys']) <= 10:
                print(f"    Missing keys: {disc['missing_keys']}")
            else:
                print(f"    Missing keys (first 10): {disc['missing_keys'][:10]}...")
                print(f"    Missing keys (last 10): ...{disc['missing_keys'][-10:]}")
            print(f"    Valid PCLAI keys count: {disc['valid_pclai_count']}")
            print(f"    Assembly combinations count: {disc['assembly_count']}")
            if disc.get('invalid_pclai_count', 0) > 0:
                print(f"    Invalid PCLAI entries (excluded): {disc['invalid_pclai_count']}")
            print()
    
    # Check for nodes with no valid entries
    nodes_no_valid = [d for d in discrepancies if 'issue' in d]
    if nodes_no_valid:
        print("=" * 80)
        print("NODES WITH NO VALID PCLAI COORDINATES")
        print("=" * 80)
        for disc in nodes_no_valid:
            print(f"  Node: {disc['node_id']}")
            print(f"    Issue: {disc['issue']}")
            print(f"    Total PCLAI entries: {disc['total_entries']}")
            print(f"    Assembly combinations: {disc['assembly_count']}")
            print()
    
    # Detailed analysis for nodes with valid PCLAI coordinates
    print("=" * 80)
    print("DETAILED ANALYSIS")
    print("=" * 80)
    
    subset_stats = defaultdict(int)
    exact_match_count = 0
    
    for node_id, node_data in nodes.items():
        assembly = node_data.get('assembly', [])
        pclai_coordinates = node_data.get('pclai_coordinates', None)
        
        if not (assembly and pclai_coordinates):
            continue
        
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
        for coord_key, coord_data in pclai_coordinates.items():
            if is_valid_pclai_entry(coord_data):
                valid_pclai_keys.add(coord_key)
        
        if len(valid_pclai_keys) == 0:
            continue  # Skip nodes with no valid entries
        
        if valid_pclai_keys == assembly_combinations:
            exact_match_count += 1
        elif valid_pclai_keys.issubset(assembly_combinations):
            subset_size = len(valid_pclai_keys)
            total_size = len(assembly_combinations)
            subset_stats[f"{subset_size}/{total_size}"] += 1
    
    print(f"Nodes where valid PCLAI keys exactly match assembly combinations: {exact_match_count}")
    print(f"Nodes where valid PCLAI keys are a proper subset:")
    for ratio, count in sorted(subset_stats.items()):
        print(f"  {ratio} (Valid PCLAI/Assembly): {count} nodes")
    
    print()
    print("=" * 80)
    print("CONCLUSION")
    print("=" * 80)
    if all_valid and len(subset_discrepancies) == 0:
        print("✓ CONFIRMED: Valid PCLAI coordinate keys are a subset of assembly/haplotype combinations")
        print(f"  All {nodes_with_valid_pclai} nodes with valid PCLAI coordinates passed verification.")
    else:
        print("✗ NOT CONFIRMED: Some valid PCLAI coordinate keys are NOT in assembly sections")
        print(f"  {len(subset_discrepancies)} nodes have discrepancies.")
        if nodes_no_valid:
            print(f"  {len(nodes_no_valid)} nodes have no valid PCLAI coordinate entries.")

if __name__ == '__main__':
    json_file = '/Users/turner/PanGenomeProject/pgb/public/hprc-project/hello-hprc.json'
    if len(sys.argv) > 1:
        json_file = sys.argv[1]
    
    analyze_pclai_subset_valid_only(json_file)
