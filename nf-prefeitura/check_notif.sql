-- Verificar notificações criadas
SELECT id, usuario_id, tipo, titulo, referencia_id, lida, created_at 
FROM notificacoes 
WHERE tipo = 'chamado_aguardando_confirmacao'
ORDER BY created_at DESC
LIMIT 10;
