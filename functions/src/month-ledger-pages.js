// Query scope (branch and calendar month) is built by the caller. Pagination
// must stay inside one Firestore transaction so concurrent postings/refunds do
// not produce a mixture of revisions. Never return a partial total on failure.
export async function monthLedgerPages(transaction, query, pageSize = 500) {
  const rows = [];
  let cursor;
  do {
    const page = await transaction.get((cursor ? query.startAfter(cursor) : query).limit(pageSize));
    for (const doc of page.docs) rows.push({ id: doc.id, ...doc.data() });
    if (page.docs.length < pageSize) return rows;
    const last = page.docs.at(-1);
    if (cursor?.ref?.path && last.ref?.path === cursor.ref.path) throw new Error('Month ledger cursor did not advance');
    cursor = last;
  } while (cursor);
  return rows;
}
