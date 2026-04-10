const bcrypt = require('bcryptjs');
const { setupAssociations } = require('./associations');
const { sequelize, testarConexao } = require('./connection');
const { runTenantMigration } = require('./tenantMigration');
const { Empresa } = require('../Models/EmpresaModel');
const { Usuario } = require('../Models/UsuarioModel');
const { Configuracao } = require('../Models/ConfiguracaoModel');
const { GrupoWhatsapp } = require('../Models/GrupoWhatsappModel');
const { Gatilho } = require('../Models/GatilhoModel');
const { Prompt } = require('../Models/PromptModel');
const { ProvedorIA } = require('../Models/ProvedorIAModel');
const { RequisicaoExterna } = require('../Models/RequisicaoExternaModel');
const { Fluxo } = require('../Models/FluxoModel');
require('../Models/IntegracaoTrelloModel');

async function setupDatabase() {
  console.log('🔧 Iniciando setup do banco de dados...\n');

  try {
    // Testa conexão primeiro
    const conectado = await testarConexao();
    if (!conectado) {
      throw new Error('Não foi possível conectar ao MySQL. Verifique se o serviço está rodando.');
    }

    await Empresa.sync({ alter: true });
    const [empresaPrincipal] = await Empresa.findOrCreate({
      where: { slug: 'principal' },
      defaults: { nome: 'Empresa principal', slug: 'principal', ativo: true }
    });
    const EID = empresaPrincipal.id;

    await sequelize.sync({ alter: true });
    console.log('✅ Tabelas sincronizadas');

    setupAssociations();

    await runTenantMigration(sequelize);

    try {
      await sequelize.query('UPDATE metas SET empresa_id = ? WHERE empresa_id IS NULL', { replacements: [EID] });
    } catch (_) {}

    // Insere configurações padrão se não existirem
    const configsPadrao = [
      {
        chave: 'atendimento_automatico',
        valor: 'false',
        tipo: 'boolean',
        categoria: 'atendimento',
        descricao: 'Ativa/desativa o atendimento automático por IA'
      },
      {
        chave: 'delay_resposta_ms',
        valor: '10000',
        tipo: 'number',
        categoria: 'atendimento',
        descricao: 'Tempo de espera antes de processar mensagens (ms)'
      },
      {
        chave: 'debounce_mensagens_ms',
        valor: '10000',
        tipo: 'number',
        categoria: 'atendimento',
        descricao: 'Debounce: tempo em ms para agrupar mensagens (fluxo, campanha e atendimento). Ex: 10000 = 10 segundos.'
      },
      {
        chave: 'campanha_ativa',
        valor: 'true',
        tipo: 'boolean',
        categoria: 'campanha',
        descricao: 'Ativa/desativa a campanha de desconto'
      },
      {
        chave: 'campanha_desconto_missao1',
        valor: '10',
        tipo: 'number',
        categoria: 'campanha',
        descricao: 'Percentual de desconto da Missão 1'
      },
      {
        chave: 'campanha_desconto_missao2',
        valor: '10',
        tipo: 'number',
        categoria: 'campanha',
        descricao: 'Percentual de desconto da Missão 2'
      },
      {
        chave: 'campanha_desconto_missao3',
        valor: '10',
        tipo: 'number',
        categoria: 'campanha',
        descricao: 'Percentual de desconto da Missão 3'
      },
      {
        chave: 'horario_funcionamento_inicio',
        valor: '18:00',
        tipo: 'string',
        categoria: 'horario',
        descricao: 'Horário de início do funcionamento'
      },
      {
        chave: 'horario_funcionamento_fim',
        valor: '23:30',
        tipo: 'string',
        categoria: 'horario',
        descricao: 'Horário de fim do funcionamento'
      },
      {
        chave: 'mensagem_fora_horario',
        valor: 'Olá! No momento estamos fechados. Nosso horário de funcionamento é das 18h às 23h30. Volte mais tarde! 🍕',
        tipo: 'string',
        categoria: 'mensagens',
        descricao: 'Mensagem enviada fora do horário de funcionamento'
      }
    ];

    for (const config of configsPadrao) {
      await Configuracao.findOrCreate({
        where: { chave: config.chave, empresaId: EID },
        defaults: { ...config, empresaId: EID }
      });
    }
    console.log('✅ Configurações padrão inseridas');

    // Insere gatilho padrão da campanha
    await Gatilho.findOrCreate({
      where: { nome: 'campanha_desconto', empresaId: EID },
      defaults: {
        empresaId: EID,
        nome: 'campanha_desconto',
        tipo: 'campanha',
        palavrasChave: ['campanha', '30% de desconto', 'desconto', 'promoção'],
        mensagemExata: 'Quero saber mais sobre a campanha de até 30% de desconto.',
        ativo: true,
        prioridade: 10
      }
    });
    console.log('✅ Gatilhos padrão inseridos');

    // Insere provedor de IA padrão (Alibaba/Qwen)
    await ProvedorIA.findOrCreate({
      where: { nome: 'qwen-alibaba', empresaId: EID },
      defaults: {
        empresaId: EID,
        nome: 'qwen-alibaba',
        descricao: 'Qwen Plus via Alibaba Cloud',
        tipo: 'alibaba',
        baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-1cdd7bc8a08f46b7b283e2d996303bfb',
        modeloPadrao: 'qwen-plus',
        modelos: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
        configuracoes: {},
        ativo: true,
        isPrincipal: true
      }
    });

    await ProvedorIA.findOrCreate({
      where: { nome: 'openrouter-claude', empresaId: EID },
      defaults: {
        empresaId: EID,
        nome: 'openrouter-claude',
        descricao: 'Claude via OpenRouter',
        tipo: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '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',
        modeloPadrao: 'anthropic/claude-3-sonnet-20240229',
        modelos: ['anthropic/claude-3-sonnet-20240229', 'anthropic/claude-3-haiku-20240307'],
        configuracoes: {},
        ativo: true,
        isPrincipal: false
      }
    });
    console.log('✅ Provedores de IA inseridos');

    // Insere prompts padrão
    const promptsPadrao = [
      {
        nome: 'atendimento_inicial',
        descricao: 'Prompt principal para atendimento de pedidos',
        tipo: 'atendimento',
        conteudo: `🤖 Agente de Atendimento – CS - Canivete Suíço (WhatsApp)

🧩 Identidade:
Você é o assistente virtual da Tempero Napolitano. Seu papel é atender com simpatia, sugerir pedidos, responder dúvidas e montar o pedido passo a passo.

🎭 Estilo:
- Fala informal e amigável ("Show!", "Massa!", "Legal!", etc.)
- Nada de linguagem robótica
- Nunca invente: peça ajuda humana quando não souber algo
- Sempre responda de forma direta e eficiente

📌 Início:
Comece com um cumprimento simpático, ex: "Oi 'fulano'! Tudo certo? Vai querer uma pizza hoje?"

👣 Etapas do pedido:
1. Tamanho  
2. Sabores (usar requisição externa)  
3. Borda (usar requisição externa)  
4. Bebidas (usar requisição externa, se quiser)  
5. Entrega ou retirada  
6. Endereço + taxa (usar requisição externa)  
7. Forma de pagamento  
8. Observações

🧠 REGRAS DE ATENDIMENTO:
- Sempre chame o cliente pelo nome
- Nunca invente valores - use requisições externas
- Conduza com perguntas simples e em sequência
- Só finalize com todos os dados confirmados`,
        variaveis: ['NOME_CLIENTE', 'PERFIL_CLIENTE'],
        ativo: true,
        versao: 1
      },
      {
        nome: 'analise_cardapio',
        descricao: 'Prompt para análise de sabores e cardápio',
        tipo: 'analise',
        conteudo: `Você é um especialista no cardápio de uma pizzaria e seu trabalho é analisar a solicitação sobre o cardápio.

⚠️ Nunca invente informações. Use apenas os dados do cardápio fornecidos.

Tire as dúvidas, mas também sugira opções. Por exemplo: se solicitado "calabresa", envie uma lista com sabores que contenham calabresa.
Considere erros de ortografia, pois a correção pode identificar o sabor solicitado.`,
        variaveis: ['CARDAPIO_SALGADOS', 'CARDAPIO_DOCES'],
        ativo: true,
        versao: 1
      },
      {
        nome: 'campanha_desconto',
        descricao: 'Prompt para campanha de 30% de desconto',
        tipo: 'campanha',
        conteudo: `🎁 Agente de Campanha – CS - Canivete Suíço (WhatsApp)

🧩 Identidade:
Você é o assistente de campanhas da Tempero Napolitano. Seu papel é guiar o cliente pelas missões da campanha de até 30% de desconto.

🎭 Estilo:
- Fala informal, animada e motivadora
- Use emojis para deixar a conversa divertida 🎉🍕🔥
- Seja direto e objetivo
- Comemore cada conquista do cliente

📋 CAMPANHA: ATÉ 30% DE DESCONTO
São 3 missões que liberam descontos progressivos:
| Missão | Descrição | Desconto |
|--------|-----------|----------|
| 1️⃣ | Entrar no grupo de promoções | +10% |
| 2️⃣ | [A definir] | +10% |
| 3️⃣ | [A definir] | +10% |

📌 ETAPA ATUAL: {{ETAPA_ATUAL}}
📊 PROGRESSO: {{PROGRESSO}}`,
        variaveis: ['ETAPA_ATUAL', 'PROGRESSO'],
        ativo: true,
        versao: 1
      },
      {
        nome: 'extrair_bairro',
        descricao: 'Prompt para extrair bairro de mensagens',
        tipo: 'extracao',
        conteudo: `Você é um assistente que extrai informações de mensagens.
O cliente enviou uma mensagem informando seu bairro. Extraia APENAS o nome do bairro.

Regras:
- Retorne SOMENTE o nome do bairro, sem pontuação ou texto adicional
- Se não conseguir identificar um bairro, retorne "NAO_IDENTIFICADO"
- Corrija erros de digitação comuns
- Ignore palavras como "meu bairro é", "moro no", "fico no", etc.

Exemplos:
- "meu bairro é petropolis" → Petrópolis
- "moro no centro" → Centro
- "fico la no bucarein" → Bucarein`,
        variaveis: [],
        ativo: true,
        versao: 1
      }
    ];

    for (const prompt of promptsPadrao) {
      await Prompt.findOrCreate({
        where: { nome: prompt.nome, empresaId: EID },
        defaults: { ...prompt, empresaId: EID }
      });
    }
    console.log('✅ Prompts padrão inseridos');

    // Insere tipos de requisições externas padrão
    const requisicoesPadrao = [
      {
        nome: 'Sabores Salgados',
        tipo: 'sabores_salgados',
        descricao: 'Consulta sabores salgados do cardápio',
        tipoHandler: 'ia',
        ativo: true
      },
      {
        nome: 'Sabores Doces',
        tipo: 'sabores_doces',
        descricao: 'Consulta sabores doces do cardápio',
        tipoHandler: 'json',
        arquivoJson: 'sabores_doces',
        ativo: true
      },
      {
        nome: 'Bordas',
        tipo: 'bordas',
        descricao: 'Lista de bordas disponíveis',
        tipoHandler: 'json',
        arquivoJson: 'bordas',
        ativo: true
      },
      {
        nome: 'Taxa de Entrega',
        tipo: 'taxa_entrega',
        descricao: 'Calcula taxa de entrega por endereço',
        tipoHandler: 'ia',
        ativo: true
      },
      {
        nome: 'Grupos WhatsApp',
        tipo: 'gruposdewhats',
        descricao: 'Busca grupo de WhatsApp por bairro',
        tipoHandler: 'funcao',
        funcaoNome: 'buscarGrupoWhatsapp',
        ativo: true
      },
      {
        nome: 'Finalizar Pedido',
        tipo: 'finalizar_pedido',
        descricao: 'Finaliza e registra o pedido',
        tipoHandler: 'funcao',
        funcaoNome: 'finalizarPedido',
        ativo: true
      },
      {
        nome: 'Atendimento Humano',
        tipo: 'atendimento_humano',
        descricao: 'Transfere para atendimento humano',
        tipoHandler: 'funcao',
        funcaoNome: 'transferirHumano',
        ativo: true
      }
    ];

    for (const req of requisicoesPadrao) {
      await RequisicaoExterna.findOrCreate({
        where: { tipo: req.tipo, empresaId: EID },
        defaults: { ...req, empresaId: EID }
      });
    }
    console.log('✅ Requisições externas inseridas');

    const superEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    const superPass = process.env.SUPER_ADMIN_PASSWORD || '';
    if (superEmail && superPass) {
      const existe = await Usuario.findOne({ where: { email: superEmail } });
      if (!existe) {
        const passwordHash = await bcrypt.hash(superPass, 10);
        await Usuario.create({
          empresaId: null,
          email: superEmail,
          passwordHash,
          nome: 'Super administrador',
          role: 'super_admin',
          ativo: true
        });
        console.log('✅ Usuário super_admin criado (variáveis SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD).');
      }
    } else {
      console.log('ℹ️  Defina SUPER_ADMIN_EMAIL e SUPER_ADMIN_PASSWORD no .env para criar o primeiro super admin.');
    }

    console.log('\n🎉 Setup do banco de dados concluído com sucesso!');

  } catch (error) {
    console.error('❌ Erro no setup do banco:', error.message);
    throw error;
  }
}

// Executa se chamado diretamente
if (require.main === module) {
  setupDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { setupDatabase };
