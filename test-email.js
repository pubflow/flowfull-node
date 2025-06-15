#!/usr/bin/env node

/**
 * Script de prueba para el sistema de emails de Bridge-Payments
 * Uso: node test-email.js [email] [nombre] [idioma]
 */

const BASE_URL = 'http://localhost:4000/bridge-payment/test-email';

async function testEmailConfig() {
  console.log('🔍 Verificando configuración de email...');
  
  try {
    const response = await fetch(`${BASE_URL}/config`);
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Configuración de email:');
      console.log(`   - ZeptoMail configurado: ${data.config.zeptomailConfigured ? '✅' : '❌'}`);
      console.log(`   - Email remitente: ${data.config.fromAddress}`);
      console.log(`   - Nombre remitente: ${data.config.fromName}`);
      console.log(`   - Organización: ${data.config.organizationName}`);
      console.log(`   - Idioma por defecto: ${data.config.defaultLanguage}`);
      console.log(`   - Idiomas disponibles: ${data.config.availableLanguages.join(', ')}`);
      console.log(`   - Template ES existe: ${data.config.templateExists.es ? '✅' : '❌'}`);
      console.log(`   - Template EN existe: ${data.config.templateExists.en ? '✅' : '❌'}`);
      
      return data.config.zeptomailConfigured;
    } else {
      console.error('❌ Error verificando configuración:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error conectando al servidor:', error.message);
    return false;
  }
}

async function sendTestEmail(email, name = 'Usuario Prueba', language = 'es') {
  console.log(`📧 Enviando email de prueba a ${email}...`);
  
  try {
    const response = await fetch(`${BASE_URL}/receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        name: name,
        language: language
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Email enviado exitosamente!');
      console.log(`   - ID de transacción: ${data.transactionId}`);
      console.log(`   - Revisa tu bandeja de entrada: ${email}`);
    } else {
      console.error('❌ Error enviando email:', data.error);
    }
    
    return data.success;
  } catch (error) {
    console.error('❌ Error enviando email:', error.message);
    return false;
  }
}

async function getTemplateInfo() {
  console.log('📄 Obteniendo información de templates...');
  
  try {
    const response = await fetch(`${BASE_URL}/template-info`);
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Información de templates:');
      console.log(`   - Idiomas disponibles: ${data.languages.join(', ')}`);
      console.log(`   - Idioma por defecto: ${data.defaultLanguage}`);
      
      for (const [lang, info] of Object.entries(data.templates)) {
        console.log(`   - ${lang.toUpperCase()}: ${info.exists ? '✅' : '❌'} (${info.path})`);
      }
    } else {
      console.error('❌ Error obteniendo info de templates:', data.error);
    }
  } catch (error) {
    console.error('❌ Error conectando al servidor:', error.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const email = args[0];
  const name = args[1] || 'Usuario Prueba';
  const language = args[2] || 'es';
  
  console.log('🚀 Iniciando pruebas del sistema de emails...\n');
  
  // 1. Verificar configuración
  const configOk = await testEmailConfig();
  console.log('');
  
  // 2. Obtener info de templates
  await getTemplateInfo();
  console.log('');
  
  // 3. Enviar email de prueba si se proporcionó email
  if (email) {
    if (configOk) {
      await sendTestEmail(email, name, language);
    } else {
      console.log('⚠️ Saltando envío de email porque la configuración no está completa');
      console.log('   Configura ZEPTOMAIL_API_KEY en tu archivo .env');
    }
  } else {
    console.log('💡 Para enviar un email de prueba, usa:');
    console.log('   node test-email.js tu-email@example.com "Tu Nombre" es');
  }
  
  console.log('\n🔗 URLs útiles:');
  console.log(`   - Configuración: ${BASE_URL}/config`);
  console.log(`   - Preview ES: ${BASE_URL}/preview/es`);
  console.log(`   - Preview EN: ${BASE_URL}/preview/en`);
  console.log(`   - Template info: ${BASE_URL}/template-info`);
}

// Ejecutar script
main().catch(error => {
  console.error('❌ Error ejecutando script:', error);
  process.exit(1);
});
