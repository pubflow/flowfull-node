#!/usr/bin/env bun

/**
 * Script to show local network information
 * Usage: bun run scripts/show-local-info.ts
 */

import { networkInterfaces } from 'os';

function getLocalIP(): string {
  const interfaces = networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  
  return '192.168.1.100'; // Fallback IP
}

function getAllNetworkInterfaces() {
  const interfaces = networkInterfaces();
  const result: Array<{name: string, address: string, family: string, internal: boolean}> = [];
  
  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue;
    
    for (const alias of iface) {
      if (alias.family === 'IPv4') {
        result.push({
          name,
          address: alias.address,
          family: alias.family,
          internal: alias.internal
        });
      }
    }
  }
  
  return result;
}

function main() {
  const localIP = getLocalIP();
  const port = process.env.PORT || '3001';
  const allInterfaces = getAllNetworkInterfaces();
  
  console.log('🌐 LOCAL NETWORK INFORMATION');
  console.log('=' .repeat(50));
  
  console.log('\n📱 Primary Local IP:', localIP);
  console.log('🔌 Port:', port);
  
  console.log('\n🔗 Access URLs:');
  console.log(`   • Local: http://localhost:${port}`);
  console.log(`   • Local: http://127.0.0.1:${port}`);
  console.log(`   • Network: http://${localIP}:${port}`);
  
  console.log('\n🖥️  All Network Interfaces:');
  allInterfaces.forEach(iface => {
    const type = iface.internal ? '(Local)' : '(Network)';
    console.log(`   • ${iface.name}: ${iface.address} ${type}`);
  });
  
  console.log('\n💡 Tips:');
  console.log('   • Use "bun run dev:local" to start in LOCAL_MODE');
  console.log('   • Share the Network URL with other devices');
  console.log('   • Make sure your firewall allows connections on this port');
  
  console.log('\n🚀 To start in local mode:');
  console.log('   bun run dev:local');
}

if (import.meta.main) {
  main();
}
