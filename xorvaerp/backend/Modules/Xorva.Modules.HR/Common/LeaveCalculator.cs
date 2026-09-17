namespace Xorva.Modules.HR.Common;

internal static class LeaveCalculator
{
    /// <summary>
    /// Counts working days in [from, to] inclusive, excluding weekends (Sat/Sun) and
    /// the supplied company holiday dates.
    /// </summary>
    public static decimal WorkingDays(DateOnly from, DateOnly to, ISet<DateOnly> holidays)
    {
        if (to < from) return 0;

        var count = 0;
        for (var day = from; day <= to; day = day.AddDays(1))
        {
            if (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) continue;
            if (holidays.Contains(day)) continue;
            count++;
        }
        return count;
    }
}
