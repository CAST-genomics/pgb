#!/usr/bin/env python3
"""
Analyze the relationship between PCLAI coordinate keys and assembly/haplotype combinations.

For each node that has both assembly and pclai_coordinates sections:
- Extract assembly/haplotype combinations from assembly section (format: assembly_name#haplotype)
- Extract keys from pclai_coordinates section
- Verify that pclai_coordinates keys are a subset of assembly combinations
"""

import json
import sys
from collections import defaultdict

def analyze_pclai_subset(json_file_path):
    """Analyze if PCLAI coordinate keys are a subset of assembly/haplotype combinations."""
    
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
            
            # Extract PCLAI coordinate keys
            pclai_keys = set(pclai_coordinates.keys())
            
            # Check if PCLAI keys are a subset of assembly combinations
            missing_in_assembly = pclai_keys - assembly_combinations
            
            if missing_in_assembly:
                all_valid = False
                discrepancies.append({
                    'node_id': node_id,
                    'missing_keys': sorted(missing_in_assembly),
                    'pclai_count': len(pclai_keys),
                    'assembly_count': len(assembly_combinations)
                })
            else:
                # Verify it's actually a subset (not just equal)
                if pclai_keys.issubset(assembly_combinations):
                    # This is good - it's a subset
                    pass
                else:
                    all_valid = False
                    discrepancies.append({
                        'node_id': node_id,
                        'error': 'PCLAI keys are not a subset',
                        'pclai_keys': sorted(pclai_keys),
                        'assembly_combinations': sorted(assembly_combinations)
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
    
    if nodes_with_both == 0:
        print("No nodes found with both assembly and pclai_coordinates sections.")
        return
    
    print("=" * 80)
    print("SUBSET VERIFICATION")
    print("=" * 80)
    
    if all_valid and len(discrepancies) == 0:
        print("✓ SUCCESS: All PCLAI coordinate keys are subsets of assembly/haplotype combinations!")
        print(f"✓ Verified {nodes_with_both} nodes with both sections")
    else:
        print(f"✗ FOUND {len(discrepancies)} DISCREPANCIES:")
        print()
        for disc in discrepancies:
            print(f"  Node: {disc['node_id']}")
            if 'missing_keys' in disc:
                print(f"    PCLAI keys missing from assembly section: {disc['missing_keys']}")
                print(f"    PCLAI keys count: {disc['pclai_count']}")
                print(f"    Assembly combinations count: {disc['assembly_count']}")
            else:
                print(f"    Error: {disc.get('error', 'Unknown error')}")
                print(f"    PCLAI keys: {disc.get('pclai_keys', [])}")
                print(f"    Assembly combinations: {disc.get('assembly_combinations', [])}")
            print()
    
    # Detailed analysis for nodes with both sections
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
        
        pclai_keys = set(pclai_coordinates.keys())
        
        if pclai_keys == assembly_combinations:
            exact_match_count += 1
        elif pclai_keys.issubset(assembly_combinations):
            subset_size = len(pclai_keys)
            total_size = len(assembly_combinations)
            subset_stats[f"{subset_size}/{total_size}"] += 1
    
    print(f"Nodes where PCLAI keys exactly match assembly combinations: {exact_match_count}")
    print(f"Nodes where PCLAI keys are a proper subset:")
    for ratio, count in sorted(subset_stats.items()):
        print(f"  {ratio} (PCLAI/Assembly): {count} nodes")
    
    print()
    print("=" * 80)
    print("CONCLUSION")
    print("=" * 80)
    if all_valid:
        print("✓ CONFIRMED: PCLAI coordinate keys are a subset of assembly/haplotype combinations")
        print(f"  All {nodes_with_both} nodes with both sections passed verification.")
    else:
        print("✗ NOT CONFIRMED: Some PCLAI coordinate keys are NOT in assembly sections")
        print(f"  {len(discrepancies)} nodes have discrepancies.")

if __name__ == '__main__':
    json_file = '/Users/turner/PanGenomeProject/pgb/public/hprc-project/hello-hprc.json'
    if len(sys.argv) > 1:
        json_file = sys.argv[1]
    
    analyze_pclai_subset(json_file)
