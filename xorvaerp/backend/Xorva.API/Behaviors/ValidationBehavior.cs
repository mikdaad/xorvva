using FluentValidation;
using MediatR;
using Xorva.Core.Exceptions;

namespace Xorva.API.Behaviors;

/// <summary>
/// MediatR pipeline behavior that intercepts every command/query and runs
/// FluentValidation validators before the handler executes.
/// 
/// Flow: Request → ValidationBehavior → Handler
/// If validation fails: Request → ValidationBehavior → throws BadRequestException (never reaches handler)
/// 
/// This eliminates ALL manual validation calls. Validators are discovered automatically
/// from the DI container via FluentValidation's assembly scanning.
/// </summary>
public class ValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators)
    {
        _validators = validators;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (!_validators.Any())
            return await next(cancellationToken);

        var context = new ValidationContext<TRequest>(request);

        var validationResults = await Task.WhenAll(
            _validators.Select(v => v.ValidateAsync(context, cancellationToken)));

        var failures = validationResults
            .SelectMany(r => r.Errors)
            .Where(f => f is not null)
            .ToList();

        if (failures.Count != 0)
        {
            throw new BadRequestException(failures.Select(f => f.ErrorMessage));
        }

        return await next(cancellationToken);
    }
}
