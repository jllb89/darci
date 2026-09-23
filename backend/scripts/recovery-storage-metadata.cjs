// Run inside the isolated Storage container; reconstruct native file metadata.
const fs=require('node:fs/promises'),path=require('node:path');
const xattr=require('/app/node_modules/fs-xattr');
// Match the pinned Storage server: its current fs-xattr uses the synchronous
// API until the upstream asynchronous implementation is fixed.
const setAttribute=xattr.setAttributeSync??xattr.set;
let input='';process.stdin.on('data',c=>input+=c);
process.stdin.on('end',async()=>{
  try{
    const entries=JSON.parse(input);
    for(const entry of entries){
      const file=path.resolve('/mnt','recovery','recovery',entry.bucket_id,entry.name,...(entry.version?[entry.version]:[]));
      if(!file.startsWith('/mnt/recovery/recovery/'))throw new Error('Invalid recovery path');
      await fs.stat(file);
      await setAttribute(file,'user.supabase.content-type',entry.metadata?.mimetype??'application/octet-stream');
      await setAttribute(file,'user.supabase.cache-control',entry.metadata?.cacheControl??'no-store');
    }
    console.log(JSON.stringify({metadataRestored:entries.length}));
  }catch{console.error('Isolated Storage metadata reconstruction failed');process.exitCode=1;}
});
