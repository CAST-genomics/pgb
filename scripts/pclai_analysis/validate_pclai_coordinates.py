#!/usr/bin/env python3
"""
Validate that all PCLAI coordinate sections have valid coordinates and RGB values.

Checks:
1. Each coordinate entry has a 'coordinates' array with exactly 2 numeric values
2. Each coordinate entry has an 'RGB' array with exactly 3 numeric values
3. RGB values are in valid range (0-255)
4. Coordinates are numeric (can be negative)
"""

import json
import sys
from collections import defaultdict

def validate_pclai_coordinates(json_file_path):
    """Validate all PCLAI coordinate entries."""
    
    print(f"Loading JSON file: {json_file_path}")
    with open(json_file_path, 'r') as f:
        data = json.load(f)
    
    nodes = data.get('node', {})
    print(f"Total nodes found: {len(nodes)}\n")
    
    # Statistics
    nodes_with_pclai = 0
    total_coordinate_entries = 0
    
    # Track issues
    issues = []
    issue_types = defaultdict(int)
    
    for node_id, node_data in nodes.items():
        pclai_coordinates = node_data.get('pclai_coordinates', None)
        
        if not pclai_coordinates:
            continue
        
        nodes_with_pclai += 1
        
        # Validate each coordinate entry
        for coord_key, coord_data in pclai_coordinates.items():
            total_coordinate_entries += 1
            
            # Check if coord_data is a dict
            if not isinstance(coord_data, dict):
                issues.append({
                    'node_id': node_id,
                    'coord_key': coord_key,
                    'issue': 'Coordinate entry is not a dictionary',
                    'type': 'invalid_structure'
                })
                issue_types['invalid_structure'] += 1
                continue
            
            # Check coordinates field
            if 'coordinates' not in coord_data:
                issues.append({
                    'node_id': node_id,
                    'coord_key': coord_key,
                    'issue': 'Missing "coordinates" field',
                    'type': 'missing_coordinates'
                })
                issue_types['missing_coordinates'] += 1
                continue
            
            coordinates = coord_data['coordinates']
            
            # Validate coordinates array
            if not isinstance(coordinates, list):
                issues.append({
                    'node_id': node_id,
                    'coord_key': coord_key,
                    'issue': f'"coordinates" is not an array (type: {type(coordinates).__name__})',
                    'type': 'invalid_coordinates_type'
                })
                issue_types['invalid_coordinates_type'] += 1
                continue
            
            if len(coordinates) != 2:
                issues.append({
                    'node_id': node_id,
                    'coord_key': coord_key,
                    'issue': f'"coordinates" array has {len(coordinates)} elements, expected 2',
                    'type': 'invalid_coordinates_length'
                })
                issue_types['invalid_coordinates_length'] += 1
                continue
            
            # Check if coordinates are numeric
            try:
                x, y = float(coordinates[0]), float(coordinates[1])
                # Coordinates can be any numeric value (including negative)
            except (ValueError, TypeError, IndexError) as e:
                issues.append({
                    'node_id': node_id,
                    'coord_key': coord_key,
                    'issue': f'Non-numeric coordinate values: {coordinates}',
                    'type': 'non_numeric_coordinates'
                })
                issue_types['non_numeric_coordinates'] += 1
                continue
            
            # Check RGB field
            if 'RGB' not in coord_data:
                issues.append({
                    'node_id': node_id,
                    'coord_key': coord_key,
                    'issue': 'Missing "RGB" field',
                    'type': 'missing_rgb'
                })
                issue_types['missing_rgb'] += 1
                continue
            
            rgb = coord_data['RGB']
            
            # Validate RGB array
            if not isinstance(rgb, list):
                issues.append({
                    'node_id': node_id,
                    'coord_key': coord_key,
                    'issue': f'"RGB" is not an array (type: {type(rgb).__name__})',
                    'type': 'invalid_rgb_type'
                })
                issue_types['invalid_rgb_type'] += 1
                continue
            
            if len(rgb) != 3:
                issues.append({
                    'node_id': node_id,
                    'coord_key': coord_key,
                    'issue': f'"RGB" array has {len(rgb)} elements, expected 3',
                    'type': 'invalid_rgb_length'
                })
                issue_types['invalid_rgb_length'] += 1
                continue
            
            # Check if RGB values are numeric and in valid range
            try:
                r, g, b = float(rgb[0]), float(rgb[1]), float(rgb[2])
                
                # Check if values are in valid range (0-255)
                if not (0 <= r <= 255) or not (0 <= g <= 255) or not (0 <= b <= 255):
                    issues.append({
                        'node_id': node_id,
                        'coord_key': coord_key,
                        'issue': f'RGB values out of range [0-255]: [{r}, {g}, {b}]',
                        'type': 'rgb_out_of_range'
                    })
                    issue_types['rgb_out_of_range'] += 1
                    continue
                
            except (ValueError, TypeError, IndexError) as e:
                issues.append({
                    'node_id': node_id,
                    'coord_key': coord_key,
                    'issue': f'Non-numeric RGB values: {rgb}',
                    'type': 'non_numeric_rgb'
                })
                issue_types['non_numeric_rgb'] += 1
                continue
    
    # Print summary
    print("=" * 80)
    print("VALIDATION SUMMARY")
    print("=" * 80)
    print(f"Nodes with pclai_coordinates: {nodes_with_pclai}")
    print(f"Total coordinate entries checked: {total_coordinate_entries}")
    print(f"Total issues found: {len(issues)}")
    print()
    
    if len(issues) == 0:
        print("✓ SUCCESS: All PCLAI coordinate entries are valid!")
        print("  - All entries have valid coordinates (2 numeric values)")
        print("  - All entries have valid RGB values (3 numeric values in range 0-255)")
    else:
        print("✗ ISSUES FOUND:")
        print()
        print("Issue breakdown by type:")
        for issue_type, count in sorted(issue_types.items()):
            print(f"  {issue_type}: {count}")
        print()
        
        print("=" * 80)
        print("DETAILED ISSUES (showing first 20)")
        print("=" * 80)
        for i, issue in enumerate(issues[:20], 1):
            print(f"\n{i}. Node: {issue['node_id']}")
            print(f"   Coordinate Key: {issue['coord_key']}")
            print(f"   Issue: {issue['issue']}")
            print(f"   Type: {issue['type']}")
        
        if len(issues) > 20:
            print(f"\n... and {len(issues) - 20} more issues")
    
    print()
    print("=" * 80)
    print("CONCLUSION")
    print("=" * 80)
    if len(issues) == 0:
        print("✓ All PCLAI coordinate sections are valid")
    else:
        print(f"✗ Found {len(issues)} invalid entries out of {total_coordinate_entries} total")
        print(f"  Error rate: {len(issues)/total_coordinate_entries*100:.2f}%")
    
    return len(issues) == 0

if __name__ == '__main__':
    json_file = '/Users/turner/PanGenomeProject/pgb/public/hprc-project/hello-hprc.json'
    if len(sys.argv) > 1:
        json_file = sys.argv[1]
    
    validate_pclai_coordinates(json_file)
