import csv,collections,sys,os
csv.field_size_limit(10**8)
d=sys.argv[1]
def num(x):
  try: return float(x.replace('$','').replace(',',''))
  except: return 0.0
print("Grant Witness full-dataset CSVs, https://data.grantwitness.org/<agency>/dl-table.csv")
print("Downloaded 2026-10-24 by @ethan/claude-evidence; summarized with a short Python script (csv module).")
print("Prime awards only (rows with Subaward ID 'N/A' where that column exists). Dollars = Grant Witness's")
print("'Funds Obligated Before Disruption' and 'Funds Remaining Before Disruption' columns, summed.\n")
for a in ['nih','nsf','epa','cdc','samhsa','ahrq','noaa']:
  r=list(csv.DictReader(open(os.path.join(d,a+'.csv'),newline='')))
  allrows=len(r)
  if 'Subaward ID' in r[0]: r=[x for x in r if x['Subaward ID'] in ('N/A','')]
  ob=sum(num(x['Funds Obligated Before Disruption']) for x in r)/1e9
  rem=sum(num(x['Funds Remaining Before Disruption']) for x in r)/1e9
  print(f"{a.upper()}: {allrows} rows, {len(r)} prime awards, {len(set(x['Grantee Organization'] for x in r))} grantee orgs")
  print(f"  current status: {dict(collections.Counter(x['Current Status'] for x in r))}")
  print(f"  detailed status: {dict(collections.Counter(x['Detailed Status'] for x in r))}")
  print(f"  obligated before disruption ${ob:.2f}B; remaining (unspent) at disruption ${rem:.2f}B")
