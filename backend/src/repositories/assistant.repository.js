import { query } from '../db/connection.js';

function mapConversationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    incidentId: row.incident_id,
    userId: row.user_id,
    title: row.title,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMessageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderRole: row.sender_role,
    content: row.content,
    structuredResponse: typeof row.structured_response === 'string' ? JSON.parse(row.structured_response) : (row.structured_response || null),
    referencedEvidence: typeof row.referenced_evidence === 'string' ? JSON.parse(row.referenced_evidence) : (row.referenced_evidence || []),
    supportingSignals: typeof row.supporting_signals === 'string' ? JSON.parse(row.supporting_signals) : (row.supporting_signals || []),
    contradictorySignals: typeof row.contradictory_signals === 'string' ? JSON.parse(row.contradictory_signals) : (row.contradictory_signals || []),
    uncertainties: typeof row.uncertainties === 'string' ? JSON.parse(row.uncertainties) : (row.uncertainties || []),
    suggestedDiagnostics: typeof row.suggested_diagnostics === 'string' ? JSON.parse(row.suggested_diagnostics) : (row.suggested_diagnostics || []),
    requiresHumanVerification: Boolean(row.requires_human_verification),
    createdAt: row.created_at
  };
}

export async function findConversationsByIncident(incidentId, userId = null) {
  const params = [incidentId];
  let sql = 'SELECT * FROM assistant_conversations WHERE incident_id = $1';
  if (userId) {
    params.push(userId);
    sql += ` AND user_id = $${params.length}`;
  }
  sql += ' ORDER BY updated_at DESC;';
  const res = await query(sql, params);
  return res.rows.map(mapConversationRow);
}

export async function findConversationById(id) {
  const res = await query('SELECT * FROM assistant_conversations WHERE id = $1;', [id]);
  return mapConversationRow(res.rows[0]);
}

export async function createConversation(data) {
  const id = data.id || `conv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const res = await query(
    `INSERT INTO assistant_conversations (id, incident_id, user_id, title, provider, model)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *;`,
    [id, data.incidentId, data.userId, data.title || 'Investigation Inquiry', data.provider || 'mock', data.model || 'mock-model']
  );
  return mapConversationRow(res.rows[0]);
}

export async function deleteConversation(id) {
  const res = await query('DELETE FROM assistant_conversations WHERE id = $1 RETURNING id;', [id]);
  return res.rows[0] || null;
}

export async function findMessagesByConversation(conversationId) {
  const res = await query(
    'SELECT * FROM assistant_messages WHERE conversation_id = $1 ORDER BY created_at ASC;',
    [conversationId]
  );
  return res.rows.map(mapMessageRow);
}

export async function createMessage(data) {
  const id = data.id || `msg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const res = await query(
    `INSERT INTO assistant_messages (
      id, conversation_id, sender_role, content, structured_response,
      referenced_evidence, supporting_signals, contradictory_signals,
      uncertainties, suggested_diagnostics, requires_human_verification
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;`,
    [
      id,
      data.conversationId,
      data.senderRole,
      data.content,
      data.structuredResponse ? JSON.stringify(data.structuredResponse) : null,
      JSON.stringify(data.referencedEvidence || []),
      JSON.stringify(data.supportingSignals || []),
      JSON.stringify(data.contradictorySignals || []),
      JSON.stringify(data.uncertainties || []),
      JSON.stringify(data.suggestedDiagnostics || []),
      data.requiresHumanVerification !== false
    ]
  );

  // Update conversation updated_at
  await query('UPDATE assistant_conversations SET updated_at = NOW() WHERE id = $1;', [data.conversationId]);

  return mapMessageRow(res.rows[0]);
}

