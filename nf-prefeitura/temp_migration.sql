-- Add reset token columns to fornecedor_credenciais table
ALTER TABLE fornecedor_credenciais
ADD COLUMN reset_token VARCHAR(255),
ADD COLUMN reset_token_expires TIMESTAMP;

-- Create index for faster lookups
CREATE INDEX idx_fornecedor_credenciais_reset_token ON fornecedor_credenciais(reset_token);
