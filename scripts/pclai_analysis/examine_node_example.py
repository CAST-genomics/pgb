#!/usr/bin/env python3
"""Examine a specific node to understand the relationship between PCLAI and assembly sections."""

import json

json_file = '/Users/turner/PanGenomeProject/pgb/public/hprc-project/hello-hprc.json'

with open(json_file, 'r') as f:
    data = json.load(f)

# Look at node 5508+ which had discrepancies
node_id = "5508+"
node_data = data['node'][node_id]

print(f"Examining node: {node_id}")
print("=" * 80)

# Build assembly combinations
assembly_combinations = set()
for entry in node_data.get('assembly', []):
    assembly_name = entry.get('assembly_name', '')
    haplotype = entry.get('haplotype', '')
    if assembly_name and haplotype:
        key = f"{assembly_name}#{haplotype}"
        assembly_combinations.add(key)

print(f"\nAssembly section has {len(assembly_combinations)} combinations")
print(f"Sample of assembly combinations (first 20):")
for combo in sorted(assembly_combinations)[:20]:
    print(f"  {combo}")

# Get PCLAI keys
pclai_coordinates = node_data.get('pclai_coordinates', {})
pclai_keys = set(pclai_coordinates.keys())

print(f"\nPCLAI coordinates section has {len(pclai_keys)} keys")
print(f"Sample of PCLAI keys (first 20):")
for key in sorted(pclai_keys)[:20]:
    print(f"  {key}")

# Check subset relationship
missing_in_assembly = pclai_keys - assembly_combinations
in_both = pclai_keys & assembly_combinations
only_in_assembly = assembly_combinations - pclai_keys

print(f"\n" + "=" * 80)
print("RELATIONSHIP ANALYSIS")
print("=" * 80)
print(f"PCLAI keys that ARE in assembly section: {len(in_both)}")
print(f"PCLAI keys that are NOT in assembly section: {len(missing_in_assembly)}")
print(f"Assembly combinations NOT in PCLAI: {len(only_in_assembly)}")

if missing_in_assembly:
    print(f"\nFirst 10 PCLAI keys missing from assembly:")
    for key in sorted(missing_in_assembly)[:10]:
        print(f"  {key}")
    
    # Check if these are specific assembly/haplotype patterns
    print(f"\nAnalyzing missing keys pattern:")
    missing_assemblies = set()
    for key in missing_in_assembly:
        parts = key.split('#')
        if len(parts) == 2:
            missing_assemblies.add(parts[0])
    
    print(f"Unique assemblies in missing keys: {len(missing_assemblies)}")
    print(f"Sample assemblies: {sorted(missing_assemblies)[:10]}")

if in_both:
    print(f"\nFirst 10 PCLAI keys that ARE in assembly:")
    for key in sorted(in_both)[:10]:
        print(f"  {key}")

print(f"\n" + "=" * 80)
print("CONCLUSION")
print("=" * 80)
if pclai_keys.issubset(assembly_combinations):
    print("✓ PCLAI keys ARE a subset of assembly combinations")
else:
    print("✗ PCLAI keys are NOT a subset of assembly combinations")
    print(f"  {len(missing_in_assembly)} PCLAI keys are not found in assembly section")
